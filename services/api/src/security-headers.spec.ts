import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { buildCorsConfig, buildCorsOptions } from './cors-options';
import { securityHeaders } from './security-headers';

// B-243. Same registration order as main.ts: security headers first, then CORS.

const WEB = 'https://app.soccernity.com';

@Controller('health')
class HealthProbe {
  @Get()
  get() {
    return { status: 'ok' };
  }
}

async function build(env: { NODE_ENV?: string }): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ controllers: [HealthProbe] }).compile();
  const app = moduleRef.createNestApplication();
  app.use(securityHeaders(env));
  app.enableCors(
    buildCorsOptions(buildCorsConfig({ ...env, WEB_APP_BASE_URL: WEB, ADMIN_APP_BASE_URL: 'https://admin.soccernity.com' })),
  );
  await app.init();
  return app;
}

function expectBaseline(headers: Record<string, string>) {
  expect(headers['content-security-policy']).toBe("default-src 'none';frame-ancestors 'none'");
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-powered-by']).toBeUndefined();
  // Same-origin by default: no API route serves media bytes.
  expect(headers['cross-origin-resource-policy']).toBe('same-origin');
}

describe('API security headers (production)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await build({ NODE_ENV: 'production' });
  });
  afterAll(async () => {
    await app.close();
  });

  it('sets the full set on /health, including HSTS', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expectBaseline(res.headers);
    expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
  });

  it('sets the same headers on a 404', async () => {
    const res = await request(app.getHttpServer()).get('/no-such-route').expect(404);
    expectBaseline(res.headers);
    expect(res.headers['strict-transport-security']).toBeDefined();
  });

  it('leaves CORS unchanged: allowed origin echoed, other origin gets no ACAO', async () => {
    const ok = await request(app.getHttpServer()).get('/health').set('Origin', WEB).expect(200);
    expect(ok.headers['access-control-allow-origin']).toBe(WEB);
    expect(ok.headers['access-control-allow-credentials']).toBeUndefined();
    expectBaseline(ok.headers);
    const bad = await request(app.getHttpServer()).get('/health').set('Origin', 'https://evil.example.org').expect(200);
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('carries the security headers on a CORS pre-flight too', async () => {
    const res = await request(app.getHttpServer())
      .options('/health')
      .set('Origin', WEB)
      .set('Access-Control-Request-Method', 'GET');
    expect(res.headers['access-control-allow-origin']).toBe(WEB);
    expect(res.headers['content-security-policy']).toBe("default-src 'none';frame-ancestors 'none'");
  });
});

describe('API security headers (non-production)', () => {
  it('omits HSTS outside production but keeps everything else', async () => {
    const app = await build({ NODE_ENV: 'development' });
    try {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expectBaseline(res.headers);
      expect(res.headers['strict-transport-security']).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
