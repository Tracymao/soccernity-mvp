import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as fs from 'fs';
import * as path from 'path';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { CountryLookupResult, GeoIpService } from '../src/geoip/geoip.service';
import { applyTrustProxy } from '../src/trust-proxy';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// B-023 / B-024 / B-025 (Decision Log #368) against real Postgres: country is
// DECLARED by the user, DERIVED from the request IP, and the DERIVED value
// decides whether an under-13 guardian must complete card verification. The IP
// itself is never stored.
//
// Registration goes through the real HTTP route. The shared 'auth' throttle
// (5 requests / 60s per IP) is sidestepped legitimately: the app trusts one
// proxy hop (as production will via TRUST_PROXY_HOPS), so each request carries
// its own X-Forwarded-For client address and gets its own bucket.

const yearsAgo = (years: number) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() - 30);
  return d.toISOString().slice(0, 10);
};

// Takes the MINOR's own email and derives a distinct, valid guardian address from
// it (registration rejects a guardian email equal to the minor's own, and an
// address with two "@" fails DTO validation).
const guardian = (minorEmail: string) => ({ name: 'Grace Parent', email: `grace-${minorEmail}`, relationship: 'Parent' });

let counter = 0;
function registerBody(over: Record<string, unknown> = {}) {
  counter += 1;
  const suffix = `${Date.now()}-${counter}`;
  return {
    email: `e2e-country-${suffix}@example.com`,
    password: 'password123',
    displayName: `Country ${counter}`,
    dateOfBirth: yearsAgo(30),
    // Required since B-073 (RegisterDto): every registration declares a country.
    countryCode: 'GB',
    ...over,
  } as Record<string, any>;
}

// Every request gets its own client address (and so its own throttle bucket).
// The THIRD octet encodes what the stubbed GeoLite2 lookup should answer, so a
// test says what it wants rather than hard-coding addresses.
const COUNTRY_OCTET: Record<string, number> = { US: 1, GB: 2, NG: 3, UNRESOLVED: 99 };
let ipCounter = 0;
const ipFor = (country: keyof typeof COUNTRY_OCTET) => `198.18.${COUNTRY_OCTET[country]}.${(ipCounter += 1)}`;
const UNRESOLVED: CountryLookupResult = { resolved: false, method: 'unresolved', reason: 'not_found' };
function stubbedLookup(ip: string | null | undefined): CountryLookupResult {
  const octet = Number(ip?.split('.')[2]);
  const code = Object.entries(COUNTRY_OCTET).find(([, o]) => o === octet)?.[0];
  return code && code !== 'UNRESOLVED' ? { resolved: true, countryCode: code, method: 'geolite2_local' } : UNRESOLVED;
}

describe('Country derivation e2e (B-023/B-024/B-025): stubbed GeoLite2 lookup', () => {
  let app: INestApplication;
  const seenIps: Array<string | null | undefined> = [];
  const geoIp = {
    lookupCountry: jest.fn(async (ip: string | null | undefined) => {
      seenIps.push(ip);
      return stubbedLookup(ip);
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GeoIpService)
      .useValue(geoIp)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    applyTrustProxy(app, '1');
    await app.init();
  });
  beforeEach(async () => {
    await resetDatabase();
    seenIps.length = 0;
    jest.clearAllMocks();
  });
  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  const register = (body: Record<string, any>, ip: string) =>
    request(app.getHttpServer()).post('/auth/register').set('X-Forwarded-For', ip).send(body);

  async function userAndGuardian(email: string) {
    const prisma = getTestPrismaClient();
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const g = await prisma.guardian.findUnique({ where: { minorUserId: user.id } });
    return { user, guardian: g };
  }

  it('stores declared + derived country, method and timestamp for an adult (the lookup is not minors-only)', async () => {
    const body = registerBody({ countryCode: 'ng' });
    await register(body, ipFor('GB')).expect(201);
    const { user } = await userAndGuardian(body.email);
    expect(user.declaredCountry).toBe('NG');
    expect(user.derivedCountry).toBe('GB');
    expect(user.countryDerivationMethod).toBe('geolite2_local');
    expect(user.countryDerivedAt).toBeInstanceOf(Date);
  });

  it('a registration without a countryCode is refused with a 400 and creates no user', async () => {
    const body = registerBody();
    delete body.countryCode;
    const res = await register(body, ipFor('GB')).expect(400);
    expect(JSON.stringify(res.body.message)).toContain('countryCode');
    expect(await getTestPrismaClient().user.findUnique({ where: { email: body.email } })).toBeNull();
  });

  it('a malformed countryCode is refused with a 400 too', async () => {
    await register(registerBody({ countryCode: 'USA' }), ipFor('GB')).expect(400);
    await register(registerBody({ countryCode: '' }), ipFor('GB')).expect(400);
  });

  describe('card verification is keyed off the DERIVED country', () => {
    const minor = (age: number, extra: Record<string, unknown> = {}) => {
      const body = registerBody({ dateOfBirth: yearsAgo(age), ...extra });
      body.guardian = guardian(body.email);
      return body;
    };

    it('under 13, derived US, declared NG -> card verification REQUIRED (typing another country does not avoid it)', async () => {
      const body = minor(10, { countryCode: 'NG' });
      await register(body, ipFor('US')).expect(201);
      const { user, guardian: g } = await userAndGuardian(body.email);
      expect(g?.cardVerificationRequired).toBe(true);
      expect(user.declaredCountry).toBe('NG');
      expect(user.derivedCountry).toBe('US');
    });

    it('under 13, derived NG, declared US -> NOT required (derived is authoritative)', async () => {
      const body = minor(10, { countryCode: 'US' });
      await register(body, ipFor('NG')).expect(201);
      const { guardian: g } = await userAndGuardian(body.email);
      expect(g?.cardVerificationRequired).toBe(false);
    });

    it('under 13, lookup UNRESOLVED -> card verification REQUIRED (the stronger control), recorded as unresolved', async () => {
      const body = minor(10, { countryCode: 'NG' });
      await register(body, ipFor('UNRESOLVED')).expect(201);
      const { user, guardian: g } = await userAndGuardian(body.email);
      expect(g?.cardVerificationRequired).toBe(true);
      expect(user.derivedCountry).toBeNull();
      expect(user.countryDerivationMethod).toBe('unresolved');
      expect(user.countryDerivedAt).toBeInstanceOf(Date);
    });

    it('13-17 is never in scope, even when the lookup is unresolved', async () => {
      const body = minor(15);
      await register(body, ipFor('UNRESOLVED')).expect(201);
      expect((await userAndGuardian(body.email)).guardian?.cardVerificationRequired).toBe(false);
    });

    it('Guardian.declaredCountry is no longer written', async () => {
      const body = minor(10, { countryCode: 'US' });
      await register(body, ipFor('US')).expect(201);
      expect((await userAndGuardian(body.email)).guardian?.declaredCountry).toBeNull();
    });
  });

  it('hands the lookup the client address Express resolved from X-Forwarded-For', async () => {
    const usIp = ipFor('US');
    await register(registerBody(), usIp).expect(201);
    expect(seenIps).toEqual([usIp]);
  });

  it('NEVER stores the IP: no column of any table contains it', async () => {
    const ip = ipFor('NG');
    const body = registerBody({ dateOfBirth: yearsAgo(10), countryCode: 'NG' });
    body.guardian = guardian(body.email);
    await register(body, ip).expect(201);

    const prisma = getTestPrismaClient();
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;
    expect(tables.length).toBeGreaterThan(10);
    for (const { table_name } of tables) {
      const rows = await prisma.$queryRawUnsafe<{ t: string }[]>(`SELECT t::text AS t FROM "${table_name}" t`);
      for (const r of rows) {
        expect(r.t).not.toContain(ip);
      }
    }
  });

  describe('database coherence (CHECK constraints)', () => {
    async function seedUser() {
      const body = registerBody();
      await register(body, ipFor('GB')).expect(201);
      return (await userAndGuardian(body.email)).user.id;
    }

    it.each([
      ['a lower-case declared code', `UPDATE "User" SET "declaredCountry" = 'us' WHERE id = $1`],
      ['a 3-letter declared code', `UPDATE "User" SET "declaredCountry" = 'USA' WHERE id = $1`],
      ['a malformed derived code', `UPDATE "User" SET "derivedCountry" = 'U1' WHERE id = $1`],
      ['"resolved" with no derived code', `UPDATE "User" SET "derivedCountry" = NULL WHERE id = $1`],
      ['"unresolved" carrying a derived code', `UPDATE "User" SET "countryDerivationMethod" = 'unresolved' WHERE id = $1`],
      ['an unknown method', `UPDATE "User" SET "countryDerivationMethod" = 'ip_api' WHERE id = $1`],
      ['a derived code with no timestamp', `UPDATE "User" SET "countryDerivedAt" = NULL WHERE id = $1`],
    ])('rejects %s', async (_label, sql) => {
      const id = await seedUser();
      await expect(getTestPrismaClient().$executeRawUnsafe(sql, id)).rejects.toThrow();
    });

    it('accepts the all-NULL state (rows from before this existed) and the anonymised state', async () => {
      const id = await seedUser();
      await getTestPrismaClient().$executeRawUnsafe(
        `UPDATE "User" SET "declaredCountry" = NULL, "derivedCountry" = NULL, "countryDerivationMethod" = NULL, "countryDerivedAt" = NULL WHERE id = $1`,
        id,
      );
    });
  });

  // The migration copies Guardian.declaredCountry across. Replay its UPDATE
  // statement (read from the real migration file, not retyped) against rows
  // that look like legacy data.
  it('the migration backfill moves a legacy Guardian.declaredCountry onto the User', async () => {
    const prisma = getTestPrismaClient();
    const sql = fs.readFileSync(
      path.resolve(__dirname, '..', 'prisma', 'migrations', '20261016120000_add_user_country_fields', 'migration.sql'),
      'utf8',
    );
    const update = sql.match(/UPDATE "User" u[\s\S]*?;/)?.[0];
    expect(update).toBeDefined();

    const body = registerBody({ dateOfBirth: yearsAgo(10) });
    body.guardian = guardian(body.email);
    await register(body, ipFor('GB')).expect(201);
    const { user } = await userAndGuardian(body.email);
    // Simulate pre-migration state: country on the Guardian, nothing on the User.
    await prisma.guardian.update({ where: { minorUserId: user.id }, data: { declaredCountry: 'US' } });
    await prisma.$executeRawUnsafe(`UPDATE "User" SET "declaredCountry" = NULL WHERE id = $1`, user.id);

    await prisma.$executeRawUnsafe(update!);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).declaredCountry).toBe('US');
  });
});

describe('Country derivation e2e: NO GeoLite2 database (the real GeoIpService, fail-safe)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // test/env.ts points GEOLITE2_DB_PATH at a file that does not exist.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    applyTrustProxy(app, '1');
    await app.init();
  });
  beforeEach(async () => resetDatabase());
  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  it('the app still boots and registration still succeeds; the lookup is recorded as unresolved', async () => {
    const body = registerBody();
    await request(app.getHttpServer()).post('/auth/register').set('X-Forwarded-For', '198.18.1.250').send(body).expect(201);
    const user = await getTestPrismaClient().user.findUniqueOrThrow({ where: { email: body.email } });
    expect(user.derivedCountry).toBeNull();
    expect(user.countryDerivationMethod).toBe('unresolved');
  });

  it('an under-13 therefore gets the STRONGER control (card verification) whatever country they declared', async () => {
    const body = registerBody({ dateOfBirth: yearsAgo(10), countryCode: 'GB' });
    body.guardian = guardian(body.email);
    await request(app.getHttpServer()).post('/auth/register').set('X-Forwarded-For', '198.18.1.251').send(body).expect(201);
    const prisma = getTestPrismaClient();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: body.email } });
    const g = await prisma.guardian.findUniqueOrThrow({ where: { minorUserId: user.id } });
    expect(g.cardVerificationRequired).toBe(true);
  });
});
