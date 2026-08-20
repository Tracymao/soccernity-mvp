// Jest `setupFiles` entry (see jest-e2e.config.js) — runs once per
// test-file worker, before that spec file's own imports execute. This is
// what guarantees `process.env.DATABASE_URL` is already the test-database
// value by the time a spec file does `import { AppModule } from
// '../src/app.module'`, which synchronously evaluates
// `ConfigModule.forRoot({ envFilePath: <repo-root>/.env })` as part of the
// `@Module(...)` decorator — see env.ts's own comment for why dotenv's
// non-overriding default makes this safe without any conditional here.
import { loadTestEnv } from './env';

loadTestEnv();
