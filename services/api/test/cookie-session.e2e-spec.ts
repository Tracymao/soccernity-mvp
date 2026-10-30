import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { PasswordService } from '../src/modules/auth/password/password.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { seedDob } from './dob-seed';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// ---------------------------------------------------------------------
// B-245 / B-248 / Decision Log "Token storage" (Build Plan 5.7) -- cookie session mode, API side.
// Real Postgres + real Redis + the real AppModule: the refresh-token store, its reuse detection and
// the two audiences' cookies are exercised end to end, not mocked.
//
// A request in cookie mode -- `X-Auth-Mode: cookie`, OR (B-248, the browser default) an Origin on the
// allowlist with no header at all -- gets the refresh token as an httpOnly, Secure, SameSite=Strict,
// host-only cookie and NOT in the body. A request with no Origin (a native client) and no header gets
// body tokens, as before.
//
// The allowed web/admin origins are set to https:// addresses for this file (the cookie code reads the
// environment per request), so the `Secure` attribute is exercised on the path real browsers take;
// the http://localhost development exception is covered by session-cookie.spec.ts.
// ---------------------------------------------------------------------

const WEB = 'https://app.cookie-test.soccernity.com';
const ADMIN = 'https://admin.cookie-test.soccernity.com';
const THIRTY_DAYS = 30 * 24 * 60 * 60;
const SEVEN_DAYS = 7 * 24 * 60 * 60;

const COOKIE_MODE = { 'X-Auth-Mode': 'cookie' };

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

function setCookies(res: request.Response): string[] {
  const raw = res.headers['set-cookie'] as unknown as string[] | string | undefined;
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}
function cookieNamed(res: request.Response, name: string): string | undefined {
  return setCookies(res).find((c) => c.startsWith(`${name}=`));
}
function valueOf(setCookie: string): string {
  return setCookie.split(';')[0].split('=').slice(1).join('=');
}
function attrsOf(setCookie: string): string[] {
  return setCookie.split(';').map((p) => p.trim());
}
function maxAgeOf(setCookie: string): number | undefined {
  const a = attrsOf(setCookie).find((x) => x.toLowerCase().startsWith('max-age='));
  return a ? Number(a.split('=')[1]) : undefined;
}

describe('Cookie session mode e2e (B-245, B-248): user audience', () => {
  let app: INestApplication;
  let savedWeb: string | undefined;
  let savedAdmin: string | undefined;

  beforeAll(async () => {
    savedWeb = process.env.WEB_APP_BASE_URL;
    savedAdmin = process.env.ADMIN_APP_BASE_URL;
    process.env.WEB_APP_BASE_URL = WEB;
    process.env.ADMIN_APP_BASE_URL = ADMIN;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
    if (savedWeb === undefined) delete process.env.WEB_APP_BASE_URL;
    else process.env.WEB_APP_BASE_URL = savedWeb;
    if (savedAdmin === undefined) delete process.env.ADMIN_APP_BASE_URL;
    else process.env.ADMIN_APP_BASE_URL = savedAdmin;
  });

  const password = 'a-real-password-123';
  async function seedUser(accountStatus = 'active') {
    const prisma = getTestPrismaClient();
    const email = uniqueEmail('cookie-user');
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await app.get(PasswordService).hash(password),
        displayName: 'Cookie Mode User',
        dateOfBirth: seedDob('1995-01-01'),
        isMinor: false,
        accountStatus,
      },
    });
    return { user, email };
  }

  function cookieLogin(email: string, extra: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post('/auth/login')
      .set(COOKIE_MODE)
      .set('Origin', WEB)
      .send({ email, password, ...extra });
  }

  it('WITHOUT the header: login returns the refresh token in the body and sets no cookie (unchanged)', async () => {
    const { email } = await seedUser();
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(200);
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.refreshTokenExpiresAt).toEqual(expect.any(String));
    expect(setCookies(res)).toHaveLength(0);
  });

  it('WITHOUT the header: refresh still takes the body token, and a cookie alone is ignored (400)', async () => {
    const { email } = await seedUser();
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(200);
    // Cookie alone, no header, no body token -> exactly the old behaviour: 400.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `sn_rt=${login.body.refreshToken}`)
      .send({})
      .expect(400);
    const ok = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);
    expect(ok.body.refreshToken).toEqual(expect.any(String));
    expect(setCookies(ok)).toHaveLength(0);
  });

  it('cookie mode login: refresh token only in the cookie (attributes), access token still in the body', async () => {
    const { email } = await seedUser();
    const res = await cookieLogin(email).expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(email.toLowerCase());
    expect(res.body).not.toHaveProperty('refreshToken');

    const cookie = cookieNamed(res, 'sn_rt');
    expect(cookie).toBeDefined();
    expect(valueOf(cookie!)).toMatch(/^[0-9a-f-]{36}\./);
    const attrs = attrsOf(cookie!);
    expect(attrs).toEqual(expect.arrayContaining(['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/auth']));
    expect(attrs.some((a) => a.toLowerCase().startsWith('domain'))).toBe(false);
    // The refresh token must not leak anywhere else in the body either.
    expect(JSON.stringify(res.body)).not.toContain(valueOf(cookie!));
  });

  it('"Stay signed in": absent/false -> session cookie; true -> persistent cookie with Max-Age = the refresh TTL', async () => {
    const { email } = await seedUser();
    const absent = await cookieLogin(email).expect(200);
    expect(maxAgeOf(cookieNamed(absent, 'sn_rt')!)).toBeUndefined();
    expect(cookieNamed(absent, 'sn_rt')).not.toMatch(/expires=/i);

    const no = await cookieLogin(email, { staySignedIn: false }).expect(200);
    expect(maxAgeOf(cookieNamed(no, 'sn_rt')!)).toBeUndefined();

    const yes = await cookieLogin(email, { staySignedIn: true }).expect(200);
    const maxAge = maxAgeOf(cookieNamed(yes, 'sn_rt')!)!;
    expect(maxAge).toBeGreaterThan(THIRTY_DAYS - 10);
    expect(maxAge).toBeLessThanOrEqual(THIRTY_DAYS);
  });

  it('rejects a non-boolean staySignedIn (declared on the DTO, validated)', async () => {
    const { email } = await seedUser();
    await cookieLogin(email, { staySignedIn: 'yes' }).expect(400);
  });

  it('cookie refresh: rotates, sets the new cookie, NEVER returns the refresh token in the body, and ignores a body token', async () => {
    const { email } = await seedUser();
    const login = await cookieLogin(email).expect(200);
    const first = valueOf(cookieNamed(login, 'sn_rt')!);

    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set(COOKIE_MODE)
      .set('Origin', WEB)
      .set('Cookie', `sn_rt=${first}`)
      // A body token is ignored in cookie mode ("never the body"): this one is garbage.
      .send({ refreshToken: 'not-a-real.token' })
      .expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body).not.toHaveProperty('refreshToken');
    const rotated = cookieNamed(res, 'sn_rt')!;
    expect(valueOf(rotated)).not.toBe(first);
    expect(JSON.stringify(res.body)).not.toContain(valueOf(rotated));
    expect(attrsOf(rotated)).toEqual(expect.arrayContaining(['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/auth']));
  });

  it('persistence survives rotation: a persistent session stays persistent, a session cookie stays a session cookie', async () => {
    const { email } = await seedUser();
    const persistentLogin = await cookieLogin(email, { staySignedIn: true }).expect(200);
    const sessionLogin = await cookieLogin(email).expect(200);

    const rotate = (login: request.Response) =>
      request(app.getHttpServer())
        .post('/auth/refresh')
        .set(COOKIE_MODE)
        .set('Origin', WEB)
        .set('Cookie', `sn_rt=${valueOf(cookieNamed(login, 'sn_rt')!)}`)
        .send({})
        .expect(200);

    const p = await rotate(persistentLogin);
    expect(maxAgeOf(cookieNamed(p, 'sn_rt')!)).toBeGreaterThan(THIRTY_DAYS - 10);
    const s = await rotate(sessionLogin);
    expect(maxAgeOf(cookieNamed(s, 'sn_rt')!)).toBeUndefined();

    // ... and again (a second rotation of the rotated cookie).
    const p2 = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set(COOKIE_MODE)
      .set('Origin', WEB)
      .set('Cookie', `sn_rt=${valueOf(cookieNamed(p, 'sn_rt')!)}`)
      .send({})
      .expect(200);
    expect(maxAgeOf(cookieNamed(p2, 'sn_rt')!)).toBeGreaterThan(THIRTY_DAYS - 10);
  });

  it('cookie refresh with no cookie -> 401', async () => {
    await request(app.getHttpServer()).post('/auth/refresh').set(COOKIE_MODE).set('Origin', WEB).send({}).expect(401);
  });

  it('cookie refresh / logout with a missing or foreign Origin -> 403, and nothing is revoked', async () => {
    const { email } = await seedUser();
    const login = await cookieLogin(email).expect(200);
    const token = valueOf(cookieNamed(login, 'sn_rt')!);

    const forged = (path: string, origin: string | undefined) => {
      // Built and awaited one at a time: supertest closes its ephemeral server after each request.
      const r = request(app.getHttpServer()).post(path).set(COOKIE_MODE).set('Cookie', `sn_rt=${token}`);
      return (origin ? r.set('Origin', origin) : r).send({});
    };
    for (const origin of [undefined, 'https://evil.example.com', 'null']) {
      await forged('/auth/refresh', origin).expect(403);
      await forged('/auth/logout', origin).expect(403);
    }

    // The forged requests did not consume or revoke the token: the real client can still refresh.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set(COOKIE_MODE)
      .set('Origin', WEB)
      .set('Cookie', `sn_rt=${token}`)
      .send({})
      .expect(200);
  });

  it('reuse detection still revokes the WHOLE family in cookie mode (and clears the dead cookie)', async () => {
    const { email } = await seedUser();
    const login = await cookieLogin(email).expect(200);
    const original = valueOf(cookieNamed(login, 'sn_rt')!);

    const rotate = (token: string) =>
      request(app.getHttpServer())
        .post('/auth/refresh')
        .set(COOKIE_MODE)
        .set('Origin', WEB)
        .set('Cookie', `sn_rt=${token}`)
        .send({});

    // Legitimate client rotates: original -> successor.
    const rotated = await rotate(original).expect(200);
    const successor = valueOf(cookieNamed(rotated, 'sn_rt')!);

    // An attacker replays the already-consumed original: 401, family revoked, cookie cleared.
    const replay = await rotate(original).expect(401);
    expect(replay.body.message).toMatch(/reuse detected/i);
    const cleared = cookieNamed(replay, 'sn_rt')!;
    expect(attrsOf(cleared)).toEqual(expect.arrayContaining(['Max-Age=0', 'HttpOnly', 'Path=/auth']));

    // The legitimate successor was in the same family, so it is dead too.
    await rotate(successor).expect(401);
  });

  it('cookie logout: clears the cookie (Max-Age=0), revokes the token, and the old cookie then fails to refresh', async () => {
    const { email } = await seedUser();
    const login = await cookieLogin(email).expect(200);
    const token = valueOf(cookieNamed(login, 'sn_rt')!);

    const res = await request(app.getHttpServer())
      .post('/auth/logout')
      .set(COOKIE_MODE)
      .set('Origin', WEB)
      .set('Cookie', `sn_rt=${token}`)
      .send({})
      .expect(204);
    const cleared = cookieNamed(res, 'sn_rt')!;
    expect(cleared.startsWith('sn_rt=;')).toBe(true);
    expect(attrsOf(cleared)).toEqual(
      expect.arrayContaining(['Max-Age=0', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/auth']),
    );

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set(COOKIE_MODE)
      .set('Origin', WEB)
      .set('Cookie', `sn_rt=${token}`)
      .send({})
      .expect(401);
  });

  it('cookie logout with allSessions revokes every other session; with no cookie it still clears and (with a token) revokes all', async () => {
    const { user, email } = await seedUser();
    const login = await cookieLogin(email).expect(200);
    const token = valueOf(cookieNamed(login, 'sn_rt')!);
    const other = await app.get(TokenService).issueTokenPair(user.id, 'fan');

    // allSessions without an access token -> 401, but the cookie is still cleared.
    const noAccess = await request(app.getHttpServer())
      .post('/auth/logout')
      .set(COOKIE_MODE)
      .set('Origin', WEB)
      .set('Cookie', `sn_rt=${token}`)
      .send({ allSessions: true })
      .expect(401);
    expect(cookieNamed(noAccess, 'sn_rt')).toContain('Max-Age=0');

    const login2 = await cookieLogin(email).expect(200);
    const token2 = valueOf(cookieNamed(login2, 'sn_rt')!);
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set(COOKIE_MODE)
      .set('Origin', WEB)
      .set('Cookie', `sn_rt=${token2}`)
      .set('Authorization', `Bearer ${login2.body.accessToken}`)
      .send({ allSessions: true })
      .expect(204);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: other.refreshToken.token })
      .expect(401);

    // No cookie at all: still 204 and the cookie is cleared.
    const bare = await request(app.getHttpServer())
      .post('/auth/logout')
      .set(COOKIE_MODE)
      .set('Origin', WEB)
      .send({})
      .expect(204);
    expect(cookieNamed(bare, 'sn_rt')).toContain('Max-Age=0');
  });

  it('WITHOUT the header: logout still requires the body token (400) and works as before', async () => {
    const { email } = await seedUser();
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(200);
    await request(app.getHttpServer()).post('/auth/logout').send({}).expect(400);
    const res = await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken: login.body.refreshToken })
      .expect(204);
    expect(setCookies(res)).toHaveLength(0);
  });

  it('B-248: an allowlisted Origin and NO X-Auth-Mode header is cookie mode -- Set-Cookie, no refreshToken in the body', async () => {
    const { email } = await seedUser();
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', WEB) // no X-Auth-Mode header
      .send({ email, password })
      .expect(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body).not.toHaveProperty('refreshToken');
    const cookie = cookieNamed(res, 'sn_rt');
    expect(cookie).toBeDefined();
    expect(attrsOf(cookie!)).toEqual(expect.arrayContaining(['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/auth']));
    expect(JSON.stringify(res.body)).not.toContain(valueOf(cookie!));
  });

  it('B-248: no Origin and NO header (a native client) still gets the refresh token in the body and no Set-Cookie', async () => {
    const { email } = await seedUser();
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(200);
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(setCookies(res)).toHaveLength(0);
  });

  it('B-248: a foreign Origin and no header gets body tokens, never a cookie', async () => {
    const { email } = await seedUser();
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', 'https://evil.example.com')
      .send({ email, password })
      .expect(200);
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(setCookies(res)).toHaveLength(0);
  });

  it('B-248: refresh with an allowlisted Origin, no header and a valid cookie rotates it; a body token is ignored; logout clears', async () => {
    const { email } = await seedUser();
    const login = await request(app.getHttpServer()).post('/auth/login').set('Origin', WEB).send({ email, password }).expect(200);
    const first = valueOf(cookieNamed(login, 'sn_rt')!);

    // Header-less, allowlisted Origin, cookie present, garbage body token -> 200 from the cookie.
    const rotated = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', WEB)
      .set('Cookie', `sn_rt=${first}`)
      .send({ refreshToken: 'not-a-real.token' })
      .expect(200);
    expect(rotated.body).not.toHaveProperty('refreshToken');
    const second = valueOf(cookieNamed(rotated, 'sn_rt')!);
    expect(second).not.toBe(first);

    // A VALID body token with an allowlisted Origin and no cookie: the body is ignored in cookie mode -> 401.
    const pair = await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(200);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', WEB)
      .send({ refreshToken: pair.body.refreshToken })
      .expect(401);

    // Logout (header-less, allowlisted Origin) clears the cookie and revokes it.
    const out = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Origin', WEB)
      .set('Cookie', `sn_rt=${second}`)
      .send({})
      .expect(204);
    expect(cookieNamed(out, 'sn_rt')).toContain('Max-Age=0');
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', WEB)
      .set('Cookie', `sn_rt=${second}`)
      .send({})
      .expect(401);
  });

  it('register in cookie mode returns the cookie (session) and omits the refresh token from the body', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .set(COOKIE_MODE)
      .set('Origin', WEB)
      .send({
        countryCode: 'GB',
        email: uniqueEmail('cookie-register'),
        password,
        displayName: 'Cookie Register',
        dateOfBirth: '2000-01-01',
      })
      .expect(201);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body).not.toHaveProperty('refreshToken');
    const cookie = cookieNamed(res, 'sn_rt')!;
    expect(attrsOf(cookie)).toEqual(expect.arrayContaining(['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/auth']));
    expect(maxAgeOf(cookie)).toBeUndefined();
  });

  it('reactivate-account in cookie mode returns the cookie and omits the refresh token from the body', async () => {
    const { email } = await seedUser('deactivated');
    const res = await request(app.getHttpServer())
      .post('/auth/reactivate-account')
      .set(COOKIE_MODE)
      .set('Origin', WEB)
      .send({ email, password })
      .expect(200);
    expect(res.body).not.toHaveProperty('refreshToken');
    expect(cookieNamed(res, 'sn_rt')).toBeDefined();
  });
});

describe('Cookie session mode e2e (B-245): admin audience and cross-audience isolation', () => {
  let app: INestApplication;
  let savedWeb: string | undefined;
  let savedAdmin: string | undefined;

  beforeAll(async () => {
    savedWeb = process.env.WEB_APP_BASE_URL;
    savedAdmin = process.env.ADMIN_APP_BASE_URL;
    process.env.WEB_APP_BASE_URL = WEB;
    process.env.ADMIN_APP_BASE_URL = ADMIN;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
    if (savedWeb === undefined) delete process.env.WEB_APP_BASE_URL;
    else process.env.WEB_APP_BASE_URL = savedWeb;
    if (savedAdmin === undefined) delete process.env.ADMIN_APP_BASE_URL;
    else process.env.ADMIN_APP_BASE_URL = savedAdmin;
  });

  const password = 'a-real-admin-password-123';
  async function seedAdmin() {
    const prisma = getTestPrismaClient();
    const email = uniqueEmail('cookie-admin');
    const admin = await prisma.adminUser.create({
      data: {
        email,
        passwordHash: await app.get(PasswordService).hash(password),
        fullName: 'Cookie Admin',
        role: 'superadmin',
      },
    });
    return { admin, email };
  }
  async function seedUser() {
    const prisma = getTestPrismaClient();
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail('cookie-cross-user'),
        passwordHash: await app.get(PasswordService).hash('irrelevant'),
        displayName: 'Cross User',
        dateOfBirth: seedDob('1995-01-01'),
        isMinor: false,
      },
    });
    return user;
  }

  it('admin cookie mode: sn_admin_rt at Path=/admin/auth, token omitted from the body, full flow incl. reuse + logout', async () => {
    const { email } = await seedAdmin();
    const login = await request(app.getHttpServer())
      .post('/admin/auth/login')
      .set(COOKIE_MODE)
      .set('Origin', ADMIN)
      .send({ email, password, staySignedIn: true })
      .expect(200);

    expect(login.body.accessToken).toEqual(expect.any(String));
    expect(login.body.admin.email).toBe(email.toLowerCase());
    expect(login.body).not.toHaveProperty('refreshToken');
    const cookie = cookieNamed(login, 'sn_admin_rt')!;
    expect(attrsOf(cookie)).toEqual(
      expect.arrayContaining(['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/admin/auth']),
    );
    // Admin refresh TTL default is 7 days (ADMIN_JWT_REFRESH_TTL_DAYS), not the user API's 30.
    expect(maxAgeOf(cookie)).toBeGreaterThan(SEVEN_DAYS - 10);
    expect(maxAgeOf(cookie)).toBeLessThanOrEqual(SEVEN_DAYS);
    // No user cookie is set by the admin route.
    expect(cookieNamed(login, 'sn_rt')).toBeUndefined();

    const original = valueOf(cookie);
    const rotate = (token: string, origin: string | undefined = ADMIN) => {
      const r = request(app.getHttpServer())
        .post('/admin/auth/refresh')
        .set(COOKIE_MODE)
        .set('Cookie', `sn_admin_rt=${token}`);
      return (origin ? r.set('Origin', origin) : r).send({});
    };

    await rotate(original, 'https://evil.example.com').expect(403);
    await request(app.getHttpServer()).post('/admin/auth/refresh').set(COOKIE_MODE).set('Origin', ADMIN).send({}).expect(401);

    const rotated = await rotate(original).expect(200);
    expect(rotated.body).not.toHaveProperty('refreshToken');
    const successor = valueOf(cookieNamed(rotated, 'sn_admin_rt')!);
    // Persistent session stays persistent across rotation.
    expect(maxAgeOf(cookieNamed(rotated, 'sn_admin_rt')!)).toBeGreaterThan(SEVEN_DAYS - 10);

    // Reuse: replaying the consumed original revokes the whole family.
    await rotate(original).expect(401);
    await rotate(successor).expect(401);

    const login2 = await request(app.getHttpServer())
      .post('/admin/auth/login')
      .set(COOKIE_MODE)
      .set('Origin', ADMIN)
      .send({ email, password })
      .expect(200);
    const token2 = valueOf(cookieNamed(login2, 'sn_admin_rt')!);
    expect(maxAgeOf(cookieNamed(login2, 'sn_admin_rt')!)).toBeUndefined();
    const out = await request(app.getHttpServer())
      .post('/admin/auth/logout')
      .set(COOKIE_MODE)
      .set('Origin', ADMIN)
      .set('Cookie', `sn_admin_rt=${token2}`)
      .send({})
      .expect(204);
    expect(cookieNamed(out, 'sn_admin_rt')).toContain('Max-Age=0');
    await rotate(token2).expect(401);
  });

  it('B-248 admin: an allowlisted Origin and NO header is cookie mode; no Origin and no header gets body tokens', async () => {
    const { email } = await seedAdmin();
    const browser = await request(app.getHttpServer())
      .post('/admin/auth/login')
      .set('Origin', ADMIN) // no X-Auth-Mode header
      .send({ email, password })
      .expect(200);
    expect(browser.body.accessToken).toEqual(expect.any(String));
    expect(browser.body).not.toHaveProperty('refreshToken');
    const cookie = cookieNamed(browser, 'sn_admin_rt');
    expect(cookie).toBeDefined();
    expect(attrsOf(cookie!)).toEqual(
      expect.arrayContaining(['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/admin/auth']),
    );

    // Header-less refresh with an allowlisted Origin reads the cookie (a garbage body token is ignored) and rotates.
    const rotated = await request(app.getHttpServer())
      .post('/admin/auth/refresh')
      .set('Origin', ADMIN)
      .set('Cookie', `sn_admin_rt=${valueOf(cookie!)}`)
      .send({ refreshToken: 'not-a-real.token' })
      .expect(200);
    expect(rotated.body).not.toHaveProperty('refreshToken');
    const next = cookieNamed(rotated, 'sn_admin_rt')!;
    expect(valueOf(next)).not.toBe(valueOf(cookie!));

    // Header-less logout with an allowlisted Origin clears the cookie.
    const out = await request(app.getHttpServer())
      .post('/admin/auth/logout')
      .set('Origin', ADMIN)
      .set('Cookie', `sn_admin_rt=${valueOf(next)}`)
      .send({})
      .expect(204);
    expect(cookieNamed(out, 'sn_admin_rt')).toContain('Max-Age=0');

    // Native client: no Origin, no header -> body token, no Set-Cookie.
    const native = await request(app.getHttpServer()).post('/admin/auth/login').send({ email, password }).expect(200);
    expect(native.body.refreshToken).toEqual(expect.any(String));
    expect(setCookies(native)).toHaveLength(0);
  });

  it('a USER cookie / token is never accepted by the ADMIN endpoints, and vice versa (cookie mode)', async () => {
    const user = await seedUser();
    const { admin } = await seedAdmin();
    const userPair = await app.get(TokenService).issueTokenPair(user.id, 'fan');
    const adminPair = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);

    const adminRefresh = (cookie: string) =>
      request(app.getHttpServer())
        .post('/admin/auth/refresh')
        .set(COOKIE_MODE)
        .set('Origin', ADMIN)
        .set('Cookie', cookie)
        .send({});
    const userRefresh = (cookie: string) =>
      request(app.getHttpServer())
        .post('/auth/refresh')
        .set(COOKIE_MODE)
        .set('Origin', WEB)
        .set('Cookie', cookie)
        .send({});

    // The user's cookie, under its own name, is invisible to the admin endpoint (it reads sn_admin_rt only).
    await adminRefresh(`sn_rt=${userPair.refreshToken.token}`).expect(401);
    // The user's token smuggled in under the ADMIN cookie name: valid shape, wrong Redis namespace.
    await adminRefresh(`sn_admin_rt=${userPair.refreshToken.token}`).expect(401);

    // Mirror image.
    await userRefresh(`sn_admin_rt=${adminPair.refreshToken.token}`).expect(401);
    await userRefresh(`sn_rt=${adminPair.refreshToken.token}`).expect(401);

    // Logout is isolated the same way: an admin token under the user cookie name revokes nothing of the admin's.
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set(COOKIE_MODE)
      .set('Origin', WEB)
      .set('Cookie', `sn_rt=${adminPair.refreshToken.token}`)
      .send({})
      .expect(204);
    await adminRefresh(`sn_admin_rt=${adminPair.refreshToken.token}`).expect(200);

    // And the sanity direction: each audience's own cookie still works on its own endpoint.
    await userRefresh(`sn_rt=${userPair.refreshToken.token}`).expect(200);
  });
});
