import { Body, Controller, Get, INestApplication, Post } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { HealthController } from '../health/health.controller';
import { AuthRateLimit } from '../modules/auth/rate-limit/auth-rate-limit.decorator';
import { AuthThrottlerGuard } from '../modules/auth/rate-limit/auth-throttler.guard';
import { AuthRateLimitModule } from '../modules/auth/rate-limit/rate-limit.module';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  RefreshRateLimit,
  SkipGlobalRateLimit,
  SkipGlobalWriteLimit,
  UploadRateLimit,
} from './global-rate-limit.decorators';
import { GlobalRateLimitModule } from './global-rate-limit.module';

// The REAL GlobalRateLimitModule (real ThrottlerModule, real GlobalThrottlerGuard as APP_GUARD, real
// TokenService verification) booted next to the REAL AuthRateLimitModule (the named 'auth' throttler,
// 5 per 60 s), driven over HTTP. Postgres and Redis are stubbed out; nothing else is.
@Controller('rl-test')
class RateLimitTestController {
  @Get('plain')
  plain() {
    return { ok: true };
  }

  @Get('other')
  other() {
    return { ok: true };
  }

  @Post('write')
  write() {
    return { ok: true };
  }

  @Post('upload')
  @UploadRateLimit()
  upload() {
    return { ok: true };
  }

  @Post('skipped')
  @SkipGlobalRateLimit()
  skipped() {
    return { ok: true };
  }

  // Stands in for a sign-in route: exempt from the writes class only.
  @Post('signin')
  @SkipGlobalWriteLimit()
  signin() {
    return { ok: true };
  }

  // Stands in for POST /auth/refresh.
  @Post('refresh')
  @SkipGlobalWriteLimit()
  @RefreshRateLimit()
  refresh(@Body() _body: { refreshToken?: string }) {
    return { ok: true };
  }

  // Carries the pre-existing named 'auth' throttler (5 per 60 s) and nothing from the global module.
  @Get('auth-limited')
  @AuthRateLimit()
  authLimited() {
    return { ok: true };
  }
}

const SECRET = 'rate-limit-http-spec-secret';

async function buildApp(overrides: Record<string, string> = {}): Promise<INestApplication> {
  const prisma = { $queryRaw: async () => 1, onModuleInit: () => undefined, onModuleDestroy: () => undefined };
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => ({ JWT_SECRET: SECRET, ...overrides })],
      }),
      // Same order as AppModule (global first). ThrottlerModule is @Global(), so a second registration
      // here once overwrote the auth options; this order + the huge-limits test below pins that.
      GlobalRateLimitModule,
      AuthRateLimitModule,
    ],
    controllers: [RateLimitTestController, HealthController],
    providers: [PrismaService, AuthThrottlerGuard],
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(RedisService)
    .useValue({ onModuleDestroy: () => undefined })
    .compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

const tokenFor = (app: INestApplication, sub: string, expiresIn: string | number = '15m') =>
  app.get(JwtService, { strict: false }).sign({ sub, role: 'user' }, { expiresIn: expiresIn as any });

describe('global rate limit (real module over HTTP) with the production defaults', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => app.close());

  it('does NOT apply the named auth throttler (5 per 60 s) to an ordinary route', async () => {
    // 12 > 5: under a leaked 'auth' throttler the 6th of these would be a 429.
    for (let i = 0; i < 12; i++) await request(app.getHttpServer()).get('/rl-test/plain').expect(200);
    for (let i = 0; i < 12; i++) await request(app.getHttpServer()).get('/rl-test/other').expect(200);
  });

  it('leaves a route that carries @AuthRateLimit() on its own 5-per-60 s limit', async () => {
    for (let i = 0; i < 5; i++) await request(app.getHttpServer()).get('/rl-test/auth-limited').expect(200);
    await request(app.getHttpServer()).get('/rl-test/auth-limited').expect(429);
  });

  it('does not limit GET /health however often it is polled', async () => {
    for (let i = 0; i < 40; i++) await request(app.getHttpServer()).get('/health').expect(200);
  });
});

// The e2e suites set every global limit to 1,000,000. The auth routes must STILL be limited at their own 5 per 60 s.
describe('global rate limit (real module over HTTP) with huge global limits (the e2e configuration)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await buildApp({
      GLOBAL_RATE_LIMIT_USER_MAX: '1000000',
      GLOBAL_RATE_LIMIT_ANON_MAX: '1000000',
      GLOBAL_RATE_LIMIT_WRITE_MAX: '1000000',
      GLOBAL_RATE_LIMIT_UPLOAD_MAX: '1000000',
    });
  });
  afterAll(async () => app.close());

  it('an @AuthRateLimit() route is still limited at the auth limit, not the global one', async () => {
    for (let i = 0; i < 5; i++) await request(app.getHttpServer()).get('/rl-test/auth-limited').expect(200);
    await request(app.getHttpServer()).get('/rl-test/auth-limited').expect(429);
  });
});

describe('global rate limit (real module over HTTP) with small numbers', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await buildApp({
      GLOBAL_RATE_LIMIT_USER_MAX: '4',
      GLOBAL_RATE_LIMIT_ANON_MAX: '5',
      GLOBAL_RATE_LIMIT_WRITE_MAX: '2',
      GLOBAL_RATE_LIMIT_UPLOAD_MAX: '1',
    });
  });
  afterAll(async () => app.close());

  it('signed-in: counts a user across routes, answers 429 with Retry-After, and leaves other callers alone', async () => {
    const t1 = tokenFor(app, 'user-A');
    const server = app.getHttpServer();
    await request(server).get('/rl-test/plain').set('Authorization', `Bearer ${t1}`).expect(200);
    await request(server).get('/rl-test/other').set('Authorization', `Bearer ${t1}`).expect(200);
    await request(server).get('/rl-test/plain').set('Authorization', `Bearer ${t1}`).expect(200);
    await request(server).get('/rl-test/other').set('Authorization', `Bearer ${t1}`).expect(200);
    const limited = await request(server).get('/rl-test/plain').set('Authorization', `Bearer ${t1}`).expect(429);
    expect(limited.headers['retry-after']).toMatch(/^\d+$/);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(limited.body).toEqual({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' });
    // another signed-in user is unaffected
    await request(server).get('/rl-test/plain').set('Authorization', `Bearer ${tokenFor(app, 'user-B')}`).expect(200);
  });

  it('anonymous: counted per IP, separately from signed-in callers', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 5; i++) await request(server).get('/rl-test/plain').expect(200);
    const limited = await request(server).get('/rl-test/plain').expect(429);
    expect(limited.headers['retry-after']).toMatch(/^\d+$/);
    // a verified user is not in the (now exhausted) anonymous bucket
    await request(server).get('/rl-test/plain').set('Authorization', `Bearer ${tokenFor(app, 'user-C')}`).expect(200);
  });
});

describe('global rate limit (real module over HTTP): token handling', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await buildApp({ GLOBAL_RATE_LIMIT_USER_MAX: '1000', GLOBAL_RATE_LIMIT_ANON_MAX: '3' });
  });
  afterAll(async () => app.close());

  it('an invalid, expired or wrong-secret token falls back to the IP bucket', async () => {
    const server = app.getHttpServer();
    const expired = tokenFor(app, 'user-D', -60);
    const foreign = new JwtService({ secret: 'some-other-secret' }).sign({ sub: 'user-D', role: 'user' });
    await request(server).get('/rl-test/plain').set('Authorization', 'Bearer garbage').expect(200);
    await request(server).get('/rl-test/plain').set('Authorization', `Bearer ${expired}`).expect(200);
    await request(server).get('/rl-test/plain').set('Authorization', `Bearer ${foreign}`).expect(200);
    await request(server).get('/rl-test/plain').set('Authorization', 'Bearer garbage').expect(429);
  });
});

describe('global rate limit (real module over HTTP): writes and uploads', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await buildApp({
      GLOBAL_RATE_LIMIT_USER_MAX: '1000',
      GLOBAL_RATE_LIMIT_WRITE_MAX: '2',
      GLOBAL_RATE_LIMIT_UPLOAD_MAX: '1',
    });
  });
  afterAll(async () => app.close());

  it('limits writes (and only writes) at the writes limit', async () => {
    const auth = { Authorization: `Bearer ${tokenFor(app, 'user-W')}` };
    const server = app.getHttpServer();
    await request(server).post('/rl-test/write').set(auth).expect(201);
    await request(server).post('/rl-test/write').set(auth).expect(201);
    const limited = await request(server).post('/rl-test/write').set(auth).expect(429);
    expect(limited.headers['retry-after']).toMatch(/^\d+$/);
    // reads are untouched by the writes class
    for (let i = 0; i < 5; i++) await request(server).get('/rl-test/plain').set(auth).expect(200);
  });

  it('limits a tagged upload route at the upload limit', async () => {
    const auth = { Authorization: `Bearer ${tokenFor(app, 'user-U')}` };
    const server = app.getHttpServer();
    await request(server).post('/rl-test/upload').set(auth).expect(201);
    await request(server).post('/rl-test/upload').set(auth).expect(429);
  });

  it('never limits a route tagged @SkipGlobalRateLimit()', async () => {
    const auth = { Authorization: `Bearer ${tokenFor(app, 'user-S')}` };
    for (let i = 0; i < 10; i++) await request(app.getHttpServer()).post('/rl-test/skipped').set(auth).expect(201);
  });
});

describe('global rate limit (real module over HTTP): @SkipGlobalWriteLimit()', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => app.close());

  it('40 POSTs from one IP within 60 s all pass a tagged route, while an untagged write route 429s on its 31st', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 40; i++) await request(server).post('/rl-test/signin').send({}).expect(201);
    for (let i = 0; i < 30; i++) await request(server).post('/rl-test/write').send({}).expect(201);
    const limited = await request(server).post('/rl-test/write').send({}).expect(429);
    expect(limited.headers['retry-after']).toMatch(/^[0-9]+$/);
  });
});

describe('global rate limit (real module over HTTP): a tagged route is still counted by the anonymous class', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await buildApp({ GLOBAL_RATE_LIMIT_ANON_MAX: '5' });
  });
  afterAll(async () => app.close());

  it('429s on the 6th request from one IP', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 5; i++) await request(server).post('/rl-test/signin').send({}).expect(201);
    await request(server).post('/rl-test/signin').send({}).expect(429);
  });
});

describe('global rate limit (real module over HTTP): refresh classes', () => {
  let app: INestApplication;
  beforeAll(async () => {
    // the production defaults for the refresh classes; roomy user/anonymous classes so only they can trip
    app = await buildApp({ GLOBAL_RATE_LIMIT_ANON_MAX: '100000', GLOBAL_RATE_LIMIT_USER_MAX: '100000' });
  });
  afterAll(async () => app.close());

  it('the 241st refresh from one IP is a 429 with Retry-After (each request presents a different token)', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 240; i++) {
      await request(server).post('/rl-test/refresh').send({ refreshToken: 'ip-' + i }).expect(201);
    }
    const limited = await request(server).post('/rl-test/refresh').send({ refreshToken: 'ip-241' }).expect(429);
    expect(limited.headers['retry-after']).toMatch(/^[0-9]+$/);
    expect(limited.body).toEqual({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' });
  });
});

describe('global rate limit (real module over HTTP): refresh per token', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await buildApp({ GLOBAL_RATE_LIMIT_ANON_MAX: '100000', GLOBAL_RATE_LIMIT_USER_MAX: '100000' });
  });
  afterAll(async () => app.close());

  it('the 11th refresh with the same token is a 429, a different token from the same IP passes', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 10; i++) await request(server).post('/rl-test/refresh').send({ refreshToken: 'same-token' }).expect(201);
    const limited = await request(server).post('/rl-test/refresh').send({ refreshToken: 'same-token' }).expect(429);
    expect(limited.headers['retry-after']).toMatch(/^[0-9]+$/);
    await request(server).post('/rl-test/refresh').send({ refreshToken: 'another-token' }).expect(201);
  });

  it('counts a cookie-mode token the same as the same token in a body', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 5; i++) await request(server).post('/rl-test/refresh').send({ refreshToken: 'mixed-token' }).expect(201);
    for (let i = 0; i < 5; i++) {
      await request(server)
        .post('/rl-test/refresh')
        .set('X-Auth-Mode', 'cookie')
        .set('Cookie', 'sn_rt=mixed-token')
        .send({})
        .expect(201);
    }
    await request(server).post('/rl-test/refresh').send({ refreshToken: 'mixed-token' }).expect(429);
  });

  it('a request presenting no token is limited by the IP class only (no per-token bucket for "nothing")', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 20; i++) await request(server).post('/rl-test/refresh').send({}).expect(201);
  });
});
