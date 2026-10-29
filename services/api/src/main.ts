// Must be the first import — Sentry has to initialize before @nestjs/core
// and any other module. See src/instrument.ts for why.
import './instrument';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import { AppModule } from './app.module';
import { buildCorsConfig, buildCorsOptions } from './cors-options';
import { securityHeaders } from './security-headers';
import { applyTrustProxy } from './trust-proxy';
import { assertProductionEnv } from './validate-runtime-env';

// Bootstraps the modular monolith described in CLAUDE.md.
// Do not split this into separate deployable services until load
// actually demands it — see MVP Build Plan Section 5.
async function bootstrap() {
  // B-018: fail the boot (not the first admin login) on missing/placeholder secrets.
  assertProductionEnv();
  const app = await NestFactory.create(AppModule);
  // B-024: see trust-proxy.ts. Unset TRUST_PROXY_HOPS = trust no proxy (fail-safe).
  applyTrustProxy(app, process.env.TRUST_PROXY_HOPS);
  // B-243 / Decision Log #420: helmet BEFORE enableCors so every response
  // (including CORS pre-flights and 404s) carries the headers.
  app.use(securityHeaders(process.env));
  // QA D-01 / Decision Log #407 item 1: no wildcard. Only the two apps' origins
  // (plus localhost outside production) -- see cors-options.ts.
  const corsConfig = buildCorsConfig(process.env);
  for (const problem of corsConfig.problems) console.error(`[cors] ${problem}`);
  app.enableCors(buildCorsOptions(corsConfig));
  // Added in Sprint 1 / PR B6 (users/profile) for PATCH /users/:id's
  // allowlist enforcement, but applies globally to every DTO-validated
  // route from here on — future PRs (B2-B4's register/login DTOs
  // included) get this for free rather than needing to opt in per
  // controller. whitelist + forbidNonWhitelisted strips/rejects any
  // request-body property that isn't declared on the target DTO, which
  // is the first line of defence (alongside each service's own explicit
  // field allowlist) against a client sending fields like `isMinor` or
  // `role` on a self-edit endpoint.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // Reports unhandled exceptions to Sentry when SENTRY_DSN is set; a no-op
  // otherwise. SentryGlobalFilter extends Nest's BaseExceptionFilter, which
  // requires the http adapter to be passed explicitly here — omitting it
  // leaves `applicationRef` undefined and crashes on the first error response.
  app.useGlobalFilters(new SentryGlobalFilter(app.getHttpAdapter()));
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Soccernity API running on port ${port}`);
}
// A refused production boot (assertProductionEnv: B-018, B-163, B-252) is a thrown error inside
// bootstrap(). Left as an unhandled rejection it printed nothing and the process stayed alive
// (observed with Sentry inactive), so a bad deploy looked like a hang with no explanation. Print the
// message and exit non-zero instead; the message never contains a secret value.
bootstrap().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
