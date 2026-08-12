import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// Bootstraps the modular monolith described in CLAUDE.md.
// Do not split this into separate deployable services until load
// actually demands it — see MVP Build Plan Section 5.
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Soccernity API running on port ${port}`);
}
bootstrap();
