// Must be the first import — Sentry has to initialize before @nestjs/core
// and any other module. See src/instrument.ts for why.
import './instrument';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import { AppModule } from './app.module';

// Bootstraps the modular monolith described in CLAUDE.md.
// Do not split this into separate deployable services until load
// actually demands it — see MVP Build Plan Section 5.
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
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
bootstrap();
