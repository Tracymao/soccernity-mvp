import { Controller, Get, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { buildCorsConfig, buildCorsOptions, isOriginAllowed, originFromBaseUrl } from './cors-options';

// QA D-01 / Decision Log #407 item 1: no wildcard CORS.

const WEB = 'https://app.soccernity.com';
const ADMIN = 'https://admin.soccernity.com';

describe('originFromBaseUrl', () => {
  it('reduces a base URL to its origin (path, query and trailing slash dropped)', () => {
    expect(originFromBaseUrl('https://app.soccernity.com/', true)).toBe(WEB);
    expect(originFromBaseUrl('https://app.soccernity.com/some/path?x=1', true)).toBe(WEB);
    expect(originFromBaseUrl('  https://app.soccernity.com  ', true)).toBe(WEB);
  });

  it('keeps a non-default port as part of the origin', () => {
    expect(originFromBaseUrl('https://app.soccernity.com:8443', true)).toBe('https://app.soccernity.com:8443');
  });

  it.each([undefined, null, '', '   ', 'not a url', 'ftp://app.soccernity.com', 'javascript:alert(1)'])(
    'rejects %p',
    (v) => {
      expect(originFromBaseUrl(v as string, false)).toBeNull();
    },
  );

  it.each(['https://app.soccernity.example', 'https://replace-me.com', 'https://example'])(
    'rejects the placeholder host %s',
    (v) => {
      expect(originFromBaseUrl(v, false)).toBeNull();
    },
  );

  it('in production requires https and refuses localhost', () => {
    expect(originFromBaseUrl('http://app.soccernity.com', true)).toBeNull();
    expect(originFromBaseUrl('https://localhost:5173', true)).toBeNull();
    expect(originFromBaseUrl('http://localhost:5173', true)).toBeNull();
  });

  it('outside production accepts a localhost URL', () => {
    expect(originFromBaseUrl('http://localhost:5173', false)).toBe('http://localhost:5173');
  });
});

describe('buildCorsConfig / isOriginAllowed', () => {
  const prod = buildCorsConfig({ NODE_ENV: 'production', WEB_APP_BASE_URL: WEB, ADMIN_APP_BASE_URL: ADMIN });

  it('production: allows exactly the two configured origins', () => {
    expect(prod.allowedOrigins).toEqual([WEB, ADMIN]);
    expect(prod.problems).toEqual([]);
    expect(isOriginAllowed(WEB, prod)).toBe(true);
    expect(isOriginAllowed(ADMIN, prod)).toBe(true);
  });

  it('production: refuses everything else, including localhost and look-alikes', () => {
    for (const o of [
      'https://evil.example.com',
      'https://app.soccernity.com.evil.com',
      'http://app.soccernity.com',
      'https://app.soccernity.com:8443',
      'https://sub.app.soccernity.com',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'null',
    ]) {
      expect(isOriginAllowed(o, prod)).toBe(false);
    }
  });

  it('a request with no Origin header is not a CORS request and is not refused', () => {
    expect(isOriginAllowed(undefined, prod)).toBe(true);
  });

  it('outside production: also allows localhost, 127.0.0.1 and [::1] on any port, http or https', () => {
    const dev = buildCorsConfig({ NODE_ENV: 'development', WEB_APP_BASE_URL: 'http://localhost:5173' });
    for (const o of [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:3000',
      'http://[::1]:5173',
      'https://localhost:8443',
    ]) {
      expect(isOriginAllowed(o, dev)).toBe(true);
    }
    expect(isOriginAllowed('https://evil.example.com', dev)).toBe(false);
    expect(isOriginAllowed('http://localhost.evil.com', dev)).toBe(false);
  });

  it('treats an unset NODE_ENV as not production (local dev, tests)', () => {
    const cfg = buildCorsConfig({});
    expect(cfg.allowLocalhost).toBe(true);
    expect(isOriginAllowed('http://localhost:5173', cfg)).toBe(true);
    expect(cfg.problems).toEqual([]);
  });

  it('production with a variable unset: that app gets no origin, a problem is reported, nothing is widened', () => {
    const cfg = buildCorsConfig({ NODE_ENV: 'production', WEB_APP_BASE_URL: WEB });
    expect(cfg.allowedOrigins).toEqual([WEB]);
    expect(cfg.problems).toHaveLength(1);
    expect(cfg.problems[0]).toContain('ADMIN_APP_BASE_URL is not set');
    expect(isOriginAllowed(ADMIN, cfg)).toBe(false);
  });

  it('production with neither set: nothing cross-origin is allowed (fail closed)', () => {
    const cfg = buildCorsConfig({ NODE_ENV: 'production' });
    expect(cfg.allowedOrigins).toEqual([]);
    expect(cfg.problems).toHaveLength(2);
    expect(isOriginAllowed(WEB, cfg)).toBe(false);
    expect(isOriginAllowed('http://localhost:5173', cfg)).toBe(false);
  });

  it('production with a placeholder or http value: reported and not allowed', () => {
    const cfg = buildCorsConfig({
      NODE_ENV: 'production',
      WEB_APP_BASE_URL: 'https://app.soccernity.example',
      ADMIN_APP_BASE_URL: 'http://admin.soccernity.com',
    });
    expect(cfg.allowedOrigins).toEqual([]);
    expect(cfg.problems).toHaveLength(2);
    expect(cfg.problems.join(' ')).toContain('unusable for CORS');
  });

  it('the same origin set twice is listed once', () => {
    const cfg = buildCorsConfig({ NODE_ENV: 'production', WEB_APP_BASE_URL: WEB, ADMIN_APP_BASE_URL: `${WEB}/admin` });
    expect(cfg.allowedOrigins).toEqual([WEB]);
  });

  it('never contains a wildcard', () => {
    expect(prod.allowedOrigins).not.toContain('*');
    expect(isOriginAllowed('*', prod)).toBe(false);
  });
});

describe('CORS over real HTTP', () => {
  @Controller('probe')
  class ProbeController {
    @Get()
    get() {
      return { ok: true };
    }
    @Post()
    post() {
      return { ok: true };
    }
  }

  async function bootstrap(env: Parameters<typeof buildCorsConfig>[0]): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({ controllers: [ProbeController] }).compile();
    const app = moduleRef.createNestApplication();
    app.enableCors(buildCorsOptions(buildCorsConfig(env)));
    await app.init();
    return app;
  }

  let prodApp: INestApplication;
  let devApp: INestApplication;

  beforeAll(async () => {
    prodApp = await bootstrap({ NODE_ENV: 'production', WEB_APP_BASE_URL: WEB, ADMIN_APP_BASE_URL: ADMIN });
    devApp = await bootstrap({ NODE_ENV: 'development', WEB_APP_BASE_URL: 'http://localhost:5173' });
  });
  afterAll(async () => {
    await prodApp.close();
    await devApp.close();
  });

  it('answers the web origin with that exact origin, never *', async () => {
    const res = await request(prodApp.getHttpServer()).get('/probe').set('Origin', WEB);
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(WEB);
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    expect(res.headers['vary']).toContain('Origin');
  });

  it('answers the admin origin with that exact origin', async () => {
    const res = await request(prodApp.getHttpServer()).get('/probe').set('Origin', ADMIN);
    expect(res.headers['access-control-allow-origin']).toBe(ADMIN);
  });

  it('sends no allow-origin header to any other origin (the browser then blocks it)', async () => {
    for (const o of ['https://evil.example.com', 'http://localhost:5173']) {
      const res = await request(prodApp.getHttpServer()).get('/probe').set('Origin', o);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    }
  });

  it('a request with no Origin header gets no allow-origin header and still works', async () => {
    const res = await request(prodApp.getHttpServer()).get('/probe');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('preflight from the web origin allows the methods and headers sign-up needs', async () => {
    const res = await request(prodApp.getHttpServer())
      .options('/probe')
      .set('Origin', WEB)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,authorization');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(WEB);
    expect(res.headers['access-control-allow-methods']).toContain('POST');
    expect(res.headers['access-control-allow-headers'].toLowerCase()).toContain('content-type');
  });

  it('preflight from a foreign origin gets no allow-origin header', async () => {
    const res = await request(prodApp.getHttpServer())
      .options('/probe')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('development: a localhost origin on any port is answered', async () => {
    const res = await request(devApp.getHttpServer()).get('/probe').set('Origin', 'http://localhost:5174');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5174');
  });
});
