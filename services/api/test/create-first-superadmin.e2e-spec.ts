import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PassThrough, Writable } from 'stream';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { runCli } from '../src/scripts/create-first-superadmin';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// backend/first-superadmin-command. Runs the REAL command logic (argument and environment handling, validation, the
// real Prisma store with its Serializable transaction, the real argon2id hasher, the read-back verification)
// against the real test Postgres, then proves the created admin can sign in through POST /admin/auth/login on the
// real, unmocked AppModule. `runCli` is the same function the compiled script calls, so what is not covered here is
// only the three lines of process wiring in main(); those were run by hand against dist/ (see the PR report).

const PASSWORD = 'a-real-first-admin-password-123';
const EMAIL = 'first-superadmin@example.com';

function sink() {
  const chunks: string[] = [];
  return {
    stream: new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk.toString());
        cb();
      },
    }),
    text: () => chunks.join(''),
  };
}

async function runCommand(extra: string[] = [], env: Record<string, string | undefined> = {}) {
  const out = sink();
  const err = sink();
  const code = await runCli({
    argv: ['--email', EMAIL, '--full-name', 'First Superadmin', '--yes', ...extra],
    env: { DATABASE_URL: process.env.DATABASE_URL, FIRST_SUPERADMIN_PASSWORD: PASSWORD, ...env },
    stdin: new PassThrough(),
    stdout: out.stream,
    stderr: err.stream,
    interactive: false,
  });
  return { code, out: out.text(), err: err.text() };
}

describe('create-first-superadmin e2e (real Postgres, real argon2id, real sign-in)', () => {
  let app: INestApplication;

  beforeAll(async () => {
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
  });

  it('--dry-run writes nothing', async () => {
    const res = await runCommand(['--dry-run']);
    expect(res.code).toBe(0);
    expect(await getTestPrismaClient().adminUser.count()).toBe(0);
  });

  it('creates one active superadmin whose password signs in through the real admin login, and never prints the secret', async () => {
    const res = await runCommand();
    expect(res.code).toBe(0);

    const rows = await getTestPrismaClient().adminUser.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: EMAIL, fullName: 'First Superadmin', role: 'superadmin', accountStatus: 'active' });
    expect(rows[0].passwordHash).toMatch(/^\$argon2id\$/);
    expect(rows[0].passwordHash).not.toBe(PASSWORD);
    expect(res.out + res.err).not.toContain(PASSWORD);
    expect(res.out + res.err).not.toContain(rows[0].passwordHash);
    expect(res.out).toContain(rows[0].id);

    const login = await request(app.getHttpServer()).post('/admin/auth/login').send({ email: EMAIL, password: PASSWORD }).expect(200);
    expect(login.body.admin).toMatchObject({ id: rows[0].id, email: EMAIL, role: 'superadmin' });
    expect(login.body.admin).not.toHaveProperty('passwordHash');
  });

  it('a wrong password is still refused by the real login (the stored hash is for the given password only)', async () => {
    expect((await runCommand()).code).toBe(0);
    await request(app.getHttpServer()).post('/admin/auth/login').send({ email: EMAIL, password: 'not-the-password-123' }).expect(401);
  });

  it('a second run refuses and changes nothing (a superadmin exists), even with a different email', async () => {
    expect((await runCommand()).code).toBe(0);
    const before = await getTestPrismaClient().adminUser.findMany();

    const again = await runCommand(['--email', 'another@example.com']);
    expect(again.code).toBe(1);
    expect(again.err).toMatch(/superadmin account already exists/);
    expect(await getTestPrismaClient().adminUser.findMany()).toEqual(before);
  });

  it('refuses when the email already belongs to a non-superadmin admin, and does not touch it', async () => {
    const prisma = getTestPrismaClient();
    await prisma.adminUser.create({ data: { email: EMAIL, fullName: 'Existing Editor', passwordHash: 'x', role: 'editor' } });
    const res = await runCommand();
    expect(res.code).toBe(1);
    expect(res.err).toMatch(/already exists/);
    const rows = await prisma.adminUser.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ role: 'editor', fullName: 'Existing Editor' });
  });

  it('two runs at the same moment create exactly one superadmin', async () => {
    const [a, b] = await Promise.all([runCommand(), runCommand(['--email', 'second@example.com'])]);
    expect([a.code, b.code].sort()).toEqual([0, 1]);
    expect(await getTestPrismaClient().adminUser.count({ where: { role: 'superadmin' } })).toBe(1);
  });

  it('an invalid input writes nothing', async () => {
    const res = await runCommand([], { FIRST_SUPERADMIN_PASSWORD: 'short' });
    expect(res.code).toBe(1);
    expect(res.err).toMatch(/password must be at least 8/);
    expect(await getTestPrismaClient().adminUser.count()).toBe(0);
  });
});
