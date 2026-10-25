import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AccountDeletionSweepService } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { UserImageReviewService } from '../src/modules/users/user-image-review.service';
import { StorageService } from '../src/storage/storage.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// backend/w8-image-rejection-reason (B-214; Decision Log #412 item 2, #398 D2), against the real
// app and real Postgres, with a FAKE object store (none exists in CI). The reject method has no
// HTTP route yet (the review queue, B-037, will call it), so the tests call
// UserImageReviewService straight from the app container and then read the result back through
// the real HTTP endpoints.

const rand = () => Math.random().toString(36).slice(2, 10);
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const REASON = 'The photo does not show your face clearly';

describe('Profile image rejection reason e2e (real Postgres, fake object store)', () => {
  let app: INestApplication;
  const http = () => app.getHttpServer();
  const store = new Map<string, Buffer>();
  const fake = {
    upload: jest.fn(async (buffer: Buffer, key: string) => {
      store.set(key, buffer);
      return `https://cdn.test/${key}`;
    }),
    delete: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StorageService)
      .useValue(fake)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  beforeEach(async () => {
    await resetDatabase();
    store.clear();
    jest.clearAllMocks();
  });
  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  async function seedUser(label: string) {
    const prisma = getTestPrismaClient();
    const suffix = `${Date.now()}-${rand()}`;
    const user = await prisma.user.create({
      data: {
        email: `e2e-w8-${label}-${suffix}@example.com`,
        passwordHash: 'unused-in-this-spec',
        displayName: `Real Name ${label}`,
        username: `${label}_${rand()}`.slice(0, 24).toLowerCase(),
        dateOfBirth: seedDob('1994-05-05'),
        isMinor: false,
        verificationStatus: 'verified',
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { id: user.id, auth: bearer(accessToken.token) };
  }
  type U = Awaited<ReturnType<typeof seedUser>>;

  const review = () => app.get(UserImageReviewService);
  const row = (u: U) => getTestPrismaClient().user.findUniqueOrThrow({ where: { id: u.id } });
  const upload = (u: U, kind: 'avatar' | 'cover') =>
    request(http()).post(`/users/${u.id}/${kind}`).set(u.auth).attach('file', JPEG, { filename: 'p', contentType: 'image/jpeg' });
  const notifications = (u: U) => getTestPrismaClient().notification.findMany({ where: { userId: u.id } });

  describe.each(['avatar', 'cover'] as const)('%s', (kind) => {
    const reasonCol = kind === 'avatar' ? 'avatarRejectionReason' : 'coverRejectionReason';
    const statusCol = kind === 'avatar' ? 'avatarStatus' : 'coverStatus';

    it('rejecting stores status + reason together and writes exactly one image-decision notification', async () => {
      const owner = await seedUser('owner');
      await upload(owner, kind).expect(201);

      await expect(review().rejectProfileImage(owner.id, kind, `  ${REASON}  `)).resolves.toEqual({
        userId: owner.id,
        kind,
        status: 'rejected',
      });

      expect(await row(owner)).toMatchObject({ [statusCol]: 'rejected', [reasonCol]: REASON });
      const rows = await notifications(owner);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ type: 'profile_image_rejected', payloadRefId: kind, read: false });
      // The notification row itself carries no copy of the reason.
      expect(JSON.stringify(rows[0])).not.toContain(REASON);
    });

    it('the OWNER sees the reason on their own GET /users/:id; nobody else is ever shown it', async () => {
      const owner = await seedUser('owner');
      const viewer = await seedUser('viewer');
      const up = await upload(owner, kind).expect(201);
      await review().rejectProfileImage(owner.id, kind, REASON);

      const mine = await request(http()).get(`/users/${owner.id}`).set(owner.auth).expect(200);
      expect(mine.body[kind]).toEqual({ url: up.body[kind].url, status: 'rejected', rejectionReason: REASON });
      // Neither the flat columns nor the storage key leak beside it.
      expect(JSON.stringify(mine.body)).not.toContain('RejectionReason');
      expect(JSON.stringify(mine.body)).not.toContain(`"${kind}Key"`);

      // Another user cannot read the owner's profile, and the public profile has no reason.
      await request(http()).get(`/users/${owner.id}`).set(viewer.auth).expect(403);
      const pub = await request(http()).get(`/users/${owner.id}/public-profile`).set(viewer.auth).expect(200);
      expect(JSON.stringify(pub.body)).not.toContain(REASON);
      expect(JSON.stringify(pub.body)).not.toContain('RejectionReason');
      expect(pub.body[`${kind}Url`]).toBeNull(); // a rejected image is never served
    });

    it('the notification reaches the Notification Centre as { image } with no reason, only for the owner', async () => {
      const owner = await seedUser('owner');
      const other = await seedUser('other');
      await upload(owner, kind).expect(201);
      await review().rejectProfileImage(owner.id, kind, REASON);

      const res = await request(http()).get('/notifications').set(owner.auth).expect(200);
      expect(res.body.unreadCount).toBe(1);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).toMatchObject({ type: 'profile_image_rejected', payloadRefId: kind, read: false, data: { image: kind } });
      expect(JSON.stringify(res.body)).not.toContain(REASON);

      const theirs = await request(http()).get('/notifications').set(other.auth).expect(200);
      expect(theirs.body.items).toEqual([]);
    });

    it('a re-upload clears the reason and puts the image back to pending (the old notification stays as history)', async () => {
      const owner = await seedUser('owner');
      await upload(owner, kind).expect(201);
      await review().rejectProfileImage(owner.id, kind, REASON);

      const again = await upload(owner, kind).expect(201);
      expect(again.body[kind]).toMatchObject({ status: 'pending', rejectionReason: null });
      expect(await row(owner)).toMatchObject({ [statusCol]: 'pending', [reasonCol]: null });
      expect(await notifications(owner)).toHaveLength(1);

      const mine = await request(http()).get(`/users/${owner.id}`).set(owner.auth).expect(200);
      expect(mine.body[kind]).toMatchObject({ status: 'pending', rejectionReason: null });
    });

    it('deleting a rejected image clears the reason with the rest of the columns', async () => {
      const owner = await seedUser('owner');
      await upload(owner, kind).expect(201);
      await review().rejectProfileImage(owner.id, kind, REASON);

      await request(http()).delete(`/users/${owner.id}/${kind}`).set(owner.auth).expect(200);
      expect(await row(owner)).toMatchObject({ [`${kind}Url`]: null, [`${kind}Key`]: null, [statusCol]: null, [reasonCol]: null });
    });

    it('an APPROVED image can still be rejected later', async () => {
      const owner = await seedUser('owner');
      await upload(owner, kind).expect(201);
      await getTestPrismaClient().user.update({ where: { id: owner.id }, data: { [statusCol]: 'approved' } });

      await review().rejectProfileImage(owner.id, kind, REASON);
      expect(await row(owner)).toMatchObject({ [statusCol]: 'rejected', [reasonCol]: REASON });
    });

    it('rejecting twice is a 409 and leaves ONE notification and the first reason', async () => {
      const owner = await seedUser('owner');
      await upload(owner, kind).expect(201);
      await review().rejectProfileImage(owner.id, kind, REASON);

      await expect(review().rejectProfileImage(owner.id, kind, 'A different reason')).rejects.toMatchObject({ status: 409 });
      expect(await notifications(owner)).toHaveLength(1);
      expect(await row(owner)).toMatchObject({ [reasonCol]: REASON });
    });

    it('two simultaneous rejections: exactly one wins, exactly one notification is written', async () => {
      const owner = await seedUser('owner');
      await upload(owner, kind).expect(201);

      const results = await Promise.allSettled([
        review().rejectProfileImage(owner.id, kind, 'First moderator'),
        review().rejectProfileImage(owner.id, kind, 'Second moderator'),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect(await notifications(owner)).toHaveLength(1);
      expect(['First moderator', 'Second moderator']).toContain((await row(owner))[reasonCol as 'avatarRejectionReason']);
    });

    it('a user with no such image: 404, nothing written; a missing or blank reason: 400, nothing written', async () => {
      const owner = await seedUser('owner');
      await expect(review().rejectProfileImage(owner.id, kind, REASON)).rejects.toMatchObject({ status: 404 });
      await upload(owner, kind).expect(201);
      await expect(review().rejectProfileImage(owner.id, kind, '   ')).rejects.toMatchObject({ status: 400 });
      await expect(review().rejectProfileImage(owner.id, kind, 'x'.repeat(301))).rejects.toMatchObject({ status: 400 });
      expect(await row(owner)).toMatchObject({ [statusCol]: 'pending', [reasonCol]: null });
      expect(await notifications(owner)).toHaveLength(0);
    });

    it('the database refuses a reason on an image that is not rejected, and a blank reason', async () => {
      const owner = await seedUser('owner');
      await upload(owner, kind).expect(201); // status 'pending'
      const prisma = getTestPrismaClient();
      await expect(prisma.user.update({ where: { id: owner.id }, data: { [reasonCol]: 'stale' } })).rejects.toThrow();
      await expect(
        prisma.user.update({ where: { id: owner.id }, data: { [statusCol]: 'rejected', [reasonCol]: '   ' } }),
      ).rejects.toThrow();
      // A real rejected row with a reason is accepted.
      await prisma.user.update({ where: { id: owner.id }, data: { [statusCol]: 'rejected', [reasonCol]: 'ok' } });
    });

    it('anonymization clears the reason together with the image reference', async () => {
      const owner = await seedUser('owner');
      await upload(owner, kind).expect(201);
      await review().rejectProfileImage(owner.id, kind, REASON);

      await app.get(AccountDeletionSweepService).anonymizeUser(owner.id, false);
      expect(await row(owner)).toMatchObject({ [`${kind}Url`]: null, [statusCol]: null, [reasonCol]: null, accountStatus: 'deleted' });
    });
  });

  it('the avatar and the cover are independent: rejecting one leaves the other and its reason untouched', async () => {
    const owner = await seedUser('owner');
    await upload(owner, 'avatar').expect(201);
    await upload(owner, 'cover').expect(201);
    await review().rejectProfileImage(owner.id, 'cover', REASON);

    const mine = await request(http()).get(`/users/${owner.id}`).set(owner.auth).expect(200);
    expect(mine.body.avatar).toMatchObject({ status: 'pending', rejectionReason: null });
    expect(mine.body.cover).toMatchObject({ status: 'rejected', rejectionReason: REASON });
  });
});
