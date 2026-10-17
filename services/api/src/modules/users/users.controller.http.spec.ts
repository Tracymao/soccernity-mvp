import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// B-026 (Decision Log #370) SUPERSEDES the PR B7 scope decision this spec used
// to pin. B7 deliberately left GuardianConsentGuard OFF PATCH /users/:id so a
// minor awaiting guardian consent could still edit their own profile. #370
// reverses that: a restricted-pending user cannot perform ANY social or profile
// write ("profile edits, represented club, follow, like, save, club join, and
// the like"). READS stay open -- the minor must be able to read their own
// profile and onboarding state (nextStep) to be routed to the Restricted
// Pending page -- so GET /users/:id and the public-profile read remain
// unguarded.
//
// The REAL GuardianConsentGuard is wired here against a fake PrismaService, so
// the 403/200 outcomes below come from the guard itself, not from an override.
describe('UsersController (HTTP layer) — restricted-pending write block (B-026)', () => {
  let app: INestApplication;
  const usersService = {
    getOwnProfile: jest.fn(),
    getPublicProfile: jest.fn(),
    updateOwnProfile: jest.fn(),
  };
  const prisma = {
    user: { findUnique: jest.fn() },
    guardian: { findUnique: jest.fn() },
  };

  let caller = { sub: 'minor-1', role: 'fan' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: PrismaService, useValue: prisma },
        GuardianConsentGuard,
      ],
    })
      // B-020: PATCH /users/:id is also behind EmailVerifiedGuard; its own behaviour is
      // covered by email-verified.guard.spec.ts and test/email-verification.e2e-spec.ts.
      .overrideGuard(EmailVerifiedGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = caller;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    caller = { sub: 'minor-1', role: 'fan' };
    prisma.user.findUnique.mockResolvedValue({ isMinor: true });
    prisma.guardian.findUnique.mockResolvedValue({ consentStatus: 'pending' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('GET /users/:id still succeeds for a minor with outstanding guardian consent (reads are not blocked)', async () => {
    usersService.getOwnProfile.mockResolvedValueOnce({
      id: 'minor-1',
      displayName: 'A Minor',
      isMinor: true,
      verificationStatus: 'unverified',
      nextStep: 'restricted_pending',
    });

    const response = await request(app.getHttpServer()).get('/users/minor-1').expect(200);

    expect(response.body.nextStep).toBe('restricted_pending');
    expect(usersService.getOwnProfile).toHaveBeenCalledWith('minor-1');
    expect(prisma.guardian.findUnique).not.toHaveBeenCalled();
  });

  it('GET /users/:id/public-profile is readable for another user (not self-only) and not swallowed by :id', async () => {
    usersService.getPublicProfile.mockResolvedValueOnce({
      id: 'someone-else',
      publicName: 'Other',
      guardianContact: { label: 'Guardian contact', email: 'parent@example.com' },
    });

    const response = await request(app.getHttpServer()).get('/users/someone-else/public-profile').expect(200);

    expect(response.body.guardianContact.email).toBe('parent@example.com');
    expect(usersService.getPublicProfile).toHaveBeenCalledWith('someone-else');
    expect(usersService.getOwnProfile).not.toHaveBeenCalled();
  });

  it('PATCH /users/:id is REFUSED (403, guardian_consent_pending) for a minor with outstanding guardian consent', async () => {
    const response = await request(app.getHttpServer())
      .patch('/users/minor-1')
      .send({ displayName: 'Updated Name' })
      .expect(403);

    expect(response.body.code).toBe('guardian_consent_pending');
    expect(usersService.updateOwnProfile).not.toHaveBeenCalled();
  });

  it('PATCH /users/:id is refused for a DECLINED minor too', async () => {
    prisma.guardian.findUnique.mockResolvedValue({ consentStatus: 'declined' });
    await request(app.getHttpServer()).patch('/users/minor-1').send({ displayName: 'x' }).expect(403);
    expect(usersService.updateOwnProfile).not.toHaveBeenCalled();
  });

  it('PATCH /users/:id succeeds once the guardian has confirmed', async () => {
    prisma.guardian.findUnique.mockResolvedValue({ consentStatus: 'confirmed' });
    usersService.updateOwnProfile.mockResolvedValueOnce({ id: 'minor-1', displayName: 'Updated Name' });

    const response = await request(app.getHttpServer())
      .patch('/users/minor-1')
      .send({ displayName: 'Updated Name' })
      .expect(200);

    expect(response.body.displayName).toBe('Updated Name');
    expect(usersService.updateOwnProfile).toHaveBeenCalledWith('minor-1', { displayName: 'Updated Name' });
  });

  it('PATCH /users/:id succeeds for an adult without ever querying Guardian', async () => {
    prisma.user.findUnique.mockResolvedValue({ isMinor: false });
    usersService.updateOwnProfile.mockResolvedValueOnce({ id: 'minor-1', displayName: 'Adult' });

    await request(app.getHttpServer()).patch('/users/minor-1').send({ displayName: 'Adult' }).expect(200);

    expect(prisma.guardian.findUnique).not.toHaveBeenCalled();
  });
});

// B-020 (Decision Log #367): the email-verification precondition is attached to
// the profile-completion write ONLY. A user who has not verified their email
// must still be able to read their own profile (to see why they are blocked).
describe('UsersController — email-verification guard placement (B-020, extended by B-118)', () => {
  const guardsOn = (method: keyof UsersController): unknown[] =>
    Reflect.getMetadata('__guards__', UsersController.prototype[method]) ?? [];

  it('protects PATCH /users/:id', () => {
    expect(guardsOn('updateById')).toContain(EmailVerifiedGuard);
  });

  it('does not protect GET /users/:id or the public profile read', () => {
    expect(guardsOn('getById')).not.toContain(EmailVerifiedGuard);
    expect(guardsOn('getPublicProfile')).not.toContain(EmailVerifiedGuard);
  });
});
