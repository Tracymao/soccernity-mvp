import { PassThrough, Writable } from 'stream';
import { runCli, loadForeignKeys, describeDatabase, USER_TABLE } from '../src/scripts/delete-test-users';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { Overrides, seedRow } from './delete-test-users.seed';

// R110. Runs the REAL command logic against the real LOCAL test Postgres (never a remote database).
// Fixture: one user with at least one row in EVERY table that references "User" (found from the live catalog, not a
// hand list), proving --execute removes the user and every dependant, leaves other users untouched, and rolls back.

const prisma = getTestPrismaClient();
const DB_NAME = describeDatabase(process.env.DATABASE_URL as string) as string;

const OVERRIDES: Overrides = {
  AccountHold: { type: 'legal_hold', placedAt: new Date() },
  ContestRound: { weekNumber: 1 },
  ContestEngagement: { kind: 'like' },
  ContestImpression: { dayKey: '2026-11-22' },
  PostMedia: { kind: 'image', declaredSize: 1, uploadState: 'awaiting_upload', status: 'pending', checkState: 'not_queued' },
  TwoFactorRecoveryRequest: { kind: 'adult', state: 'pending' },
  DataExportRequest: { status: 'preparing' },
  ContactEnquiry: { category: 'enquiries', status: 'new', lastMessageAt: new Date() },
  Report: { targetType: 'user', targetId: 'placeholder', status: 'open' },
};

function sink() {
  const chunks: string[] = [];
  return {
    stream: new Writable({ write(c, _e, cb) { chunks.push(c.toString()); cb(); } }),
    text: () => chunks.join(''),
  };
}

async function run(argv: string[], env: Record<string, string | undefined> = {}, files: Record<string, string> = {}) {
  const out = sink();
  const err = sink();
  const code = await runCli({
    argv,
    env: { DATABASE_URL: process.env.DATABASE_URL, ...env },
    stdin: new PassThrough(),
    stdout: out.stream,
    stderr: err.stream,
    readFile: (p) => {
      if (!(p in files)) throw new Error('no such file');
      return files[p];
    },
  });
  return { code, out: out.text(), err: err.text() };
}

async function mkUser(email: string, extra: Record<string, unknown> = {}) {
  return (await seedRow(prisma, USER_TABLE, { email, ...extra }, OVERRIDES, '')) as { id: string; email: string };
}

const count = async (table: string, where = '') =>
  Number((await prisma.$queryRawUnsafe<{ c: string }[]>(`select count(*)::text as c from "${table}" ${where}`))[0].c);

// Seeds one row in every table with a foreign key to User (any ON DELETE action), pointing at `userId`.
async function seedEverything(userId: string): Promise<string[]> {
  const fks = await loadForeignKeys({
    query: (s, p = []) => prisma.$queryRawUnsafe(s, ...p) as never,
    execute: (s, p = []) => prisma.$executeRawUnsafe(s, ...p),
  });
  const tables = [...new Set(fks.filter((f) => f.parentTable === USER_TABLE && f.childTable !== USER_TABLE && f.childTable !== 'AdminUser').map((f) => f.childTable))];
  const done: string[] = [];
  const partner = await mkUser(`partner-${userId.slice(0, 8)}@example.com`);
  for (const t of tables) {
    const cols = fks.filter((f) => f.childTable === t && f.parentTable === USER_TABLE);
    // First FK column that is the "owner" side; other User columns (if any) get the same user (a self-relationship row).
    const fixed: Record<string, unknown> = {};
    // Tables with two User columns (Follow, Block) are relationships: the second side is a different person.
    cols.forEach((c, i) => {
      fixed[c.childColumn] = i === 0 ? userId : partner.id;
    });
    await seedRow(prisma, t, fixed, OVERRIDES, userId);
    done.push(t);
  }
  return done;
}

describe('delete-test-users (e2e, local Postgres only)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });
  afterAll(async () => {
    await disconnectTestPrismaClient();
  });

  const base = (extra: string[] = []) => ['--expect-database', DB_NAME, ...extra];

  it('refuses without --expect-database, with the wrong one, in production and with no emails', async () => {
    expect((await run(['--email', 'a@x.com'])).code).toBe(1);
    const wrong = await run(['--email', 'a@x.com', '--expect-database', 'someone_elses_db']);
    expect(wrong.code).toBe(1);
    expect(wrong.err).toContain('Refused');
    const prod = await run(base(['--email', 'a@x.com']), { NODE_ENV: 'production' });
    expect(prod.code).toBe(1);
    expect(prod.err).toContain('production');
    const none = await run(base());
    expect(none.code).toBe(1);
    expect(none.err).toContain('No emails');
    const wild = await run(base(['--email', '%@example.com']));
    expect(wild.code).toBe(1);
  });

  it('never prints the connection string, host, user or password', async () => {
    await mkUser('t1@example.com');
    const r = await run(base(['--email', 't1@example.com']));
    const url = new URL(process.env.DATABASE_URL as string);
    // The database NAME is printed on purpose; in CI the password ("soccernity") is a substring of
    // that name, so drop the one legitimate "Database:" line before looking for secrets.
    const rest = (r.out + r.err).replace(`Database: ${DB_NAME}`, '');
    for (const secret of [url.password, `${url.username}:${url.password}`, url.host, process.env.DATABASE_URL as string]) {
      if (secret) expect(rest).not.toContain(secret);
    }
    expect(r.out).toContain(`Database: ${DB_NAME}`);
  });

  it('dry run writes nothing and reports counts; execute needs --confirm', async () => {
    const u = await mkUser('t2@example.com');
    await seedEverything(u.id);
    const before = await count('User');
    const dry = await run(base(['--email', 't2@example.com']));
    expect(dry.code).toBe(0);
    expect(dry.out).toContain('DRY RUN');
    expect(dry.out).toContain('Rows that would be deleted');
    expect(await count('User')).toBe(before);
    const noConfirm = await run(base(['--email', 't2@example.com', '--execute']));
    expect(noConfirm.code).toBe(1);
    const wrongConfirm = await run(base(['--email', 't2@example.com', '--execute', '--confirm=2']));
    expect(wrongConfirm.code).toBe(1);
    expect(await count('User')).toBe(before);
  });

  it('reports a missing email in the dry run and refuses it on execute without --allow-missing', async () => {
    await mkUser('t3@example.com');
    const dry = await run(base(['--email', 't3@example.com', '--email', 'ghost@example.com']));
    expect(dry.code).toBe(0);
    expect(dry.out).toContain('Not found (1)');
    const exec = await run(base(['--email', 't3@example.com', '--email', 'ghost@example.com', '--execute', '--confirm=1']));
    expect(exec.code).toBe(1);
    expect(await count('User')).toBe(1);
    const ok = await run(base(['--email', 't3@example.com', '--email', 'ghost@example.com', '--execute', '--confirm=1', '--allow-missing']));
    expect(ok.code).toBe(0);
    expect(await count('User')).toBe(0);
  });

  it('reads emails from a file (comments and blank lines ignored)', async () => {
    await mkUser('t4@example.com');
    const r = await run(base(['--emails-file', 'list.txt']), {}, { 'list.txt': '# test\n\nT4@example.com\n' });
    expect(r.code).toBe(0);
    expect(r.out).toContain('t4@example.com');
  });

  it('refuses a user linked to an AdminUser', async () => {
    await mkUser('boss@example.com');
    await seedRow(prisma, 'AdminUser', { email: 'boss@example.com' }, OVERRIDES, '');
    const r = await run(base(['--email', 'boss@example.com']));
    expect(r.code).toBe(1);
    expect(r.err).toContain('AdminUser');
    expect(await count('User')).toBe(1);
  });

  it('refuses a guardian whose minor is not in the list, and allows it when the minor is listed too', async () => {
    const minor = await mkUser('kid@example.com', { isMinor: true });
    await mkUser('parent@example.com');
    await seedRow(prisma, 'Guardian', { minorUserId: minor.id, email: 'parent@example.com' }, OVERRIDES, minor.id);
    const r = await run(base(['--email', 'parent@example.com']));
    expect(r.code).toBe(1);
    expect(r.err).toContain('guardian');
    const both = await run(base(['--email', 'parent@example.com', '--email', 'kid@example.com', '--execute', '--confirm=2']));
    expect(both.code).toBe(0);
    expect(await count('User')).toBe(0);
    expect(await count('Guardian')).toBe(0);
  });

  it('refuses content that other users interacted with unless --include-others-content', async () => {
    const owner = await mkUser('owner@example.com');
    const other = await mkUser('real@example.com');
    const post = await seedRow(prisma, 'Post', { authorId: owner.id }, OVERRIDES, owner.id);
    await seedRow(prisma, 'Comment', { postId: post.id, authorId: other.id }, OVERRIDES, other.id);
    const r = await run(base(['--email', 'owner@example.com']));
    expect(r.code).toBe(1);
    expect(r.out).toContain("Other users' rows");
    expect(r.err).toContain('--include-others-content');
    const ok = await run(base(['--email', 'owner@example.com', '--execute', '--confirm=1', '--include-others-content']));
    expect(ok.code).toBe(0);
    expect(await count('User')).toBe(1);
    expect(await count('Comment')).toBe(0);
  });

  it('keeps a Report the test user filed about someone else, with the reporter cleared', async () => {
    const test = await mkUser('tester@example.com');
    const real = await mkUser('real2@example.com');
    const rep = await seedRow(prisma, 'Report', { reporterId: test.id, targetType: 'user', targetId: real.id }, OVERRIDES, test.id);
    const dry = await run(base(['--email', 'tester@example.com']));
    expect(dry.code).toBe(0);
    const r = await run(base(['--email', 'tester@example.com', '--execute', '--confirm=1']));
    expect(r.code).toBe(0);
    const left = await prisma.$queryRawUnsafe<{ reporterId: string | null }[]>(`select "reporterId" from "Report" where id = $1`, rep.id as string);
    expect(left).toHaveLength(1);
    expect(left[0].reporterId).toBeNull();
    expect(await count('User', `where id = '${real.id}'`)).toBe(1);
  });

  it('removes the user and a row in EVERY referencing table, leaves others untouched', async () => {
    const t = await mkUser('big@example.com');
    const keep = await mkUser('keep@example.com');
    const keepSeeded = await seedEverything(keep.id);
    // Only tables that reference User: parent rows (cycles, conversations, rooms) are shared and legitimately remain.
    const userChildren = new Set(
      (
        await loadForeignKeys({
          query: (q, p = []) => prisma.$queryRawUnsafe(q, ...p) as never,
          execute: (q, p = []) => prisma.$executeRawUnsafe(q, ...p),
        })
      )
        .filter((x) => x.parentTable === USER_TABLE)
        .map((x) => x.childTable),
    );
    const keepTables = keepSeeded.filter((x) => userChildren.has(x));
    const beforeKeep = await Promise.all(keepTables.map((x) => count(x)));
    const seeded = await seedEverything(t.id);
    expect(seeded.length).toBeGreaterThan(30);
    const r = await run(base(['--email', 'big@example.com', '--execute', '--confirm=1', '--include-others-content']));
    expect({ code: r.code, err: r.err }).toEqual({ code: 0, err: '' });
    expect(await count('User', `where email = 'big@example.com'`)).toBe(0);
    expect(await count('User', `where email = 'keep@example.com'`)).toBe(1);
    const fks = await loadForeignKeys({
      query: (s, p = []) => prisma.$queryRawUnsafe(s, ...p) as never,
      execute: (s, p = []) => prisma.$executeRawUnsafe(s, ...p),
    });
    for (const f of fks.filter((x) => x.parentTable === USER_TABLE && x.childTable !== USER_TABLE)) {
      expect(await count(f.childTable, `where "${f.childColumn}"::text = '${t.id}'`)).toBe(0);
    }
    const afterKeep = await Promise.all(keepTables.map((x) => count(x)));
    // Report (filed about someone else: kept, reporter cleared) and GrassrootsTeam (parent teams of the fixture)
    // legitimately keep rows that were created while seeding the target, so they may only grow.
    const grows = new Set(['Report', 'GrassrootsTeam']);
    keepTables.forEach((x, i) => {
      if (grows.has(x)) expect(afterKeep[i]).toBeGreaterThanOrEqual(beforeKeep[i]);
      else expect({ [x]: afterKeep[i] }).toEqual({ [x]: beforeKeep[i] });
    });
    expect(r.out).toMatch(/DONE .* database=\S+ users=1 rows=/);
    expect(r.out).not.toContain('big@example.com' + ' rows');
  });

  it('rolls everything back when one step fails', async () => {
    const t = await mkUser('rb@example.com');
    await seedEverything(t.id);
    const beforeUsers = await count('User');
    const beforeRows = await count('Notification');
    // A trigger that forbids deleting from one table forces a failure part-way through.
    await prisma.$executeRawUnsafe(`create or replace function r110_block() returns trigger as $$ begin raise exception 'blocked'; end; $$ language plpgsql`);
    await prisma.$executeRawUnsafe(`create trigger r110_block_t before delete on "User" for each row execute function r110_block()`);
    try {
      const r = await run(base(['--email', 'rb@example.com', '--execute', '--confirm=1', '--include-others-content']));
      expect(r.code).toBe(1);
      expect(r.err).toContain('rolled back');
      expect(r.err).not.toContain('rb@example.com');
    } finally {
      await prisma.$executeRawUnsafe(`drop trigger if exists r110_block_t on "User"`);
      await prisma.$executeRawUnsafe(`drop function if exists r110_block()`);
    }
    expect(await count('User')).toBe(beforeUsers);
    expect(await count('Notification')).toBe(beforeRows);
  });

  it('GUARD: every table with a RESTRICT/NO ACTION foreign key to User is handled by the fixture and the run', async () => {
    const fks = await loadForeignKeys({
      query: (s, p = []) => prisma.$queryRawUnsafe(s, ...p) as never,
      execute: (s, p = []) => prisma.$executeRawUnsafe(s, ...p),
    });
    const restrict = [...new Set(fks.filter((f) => f.parentTable === USER_TABLE && f.onDelete === 'restrict' && f.childTable !== 'AdminUser').map((f) => f.childTable))];
    const t = await mkUser('guard@example.com');
    const seeded = new Set(await seedEverything(t.id));
    const unseeded = restrict.filter((x) => !seeded.has(x));
    // A NEW restrict table that the seeder cannot fill makes this fail, naming the table: handle it, then re-run.
    expect(unseeded).toEqual([]);
    const r = await run(base(['--email', 'guard@example.com', '--execute', '--confirm=1', '--include-others-content']));
    expect({ code: r.code, err: r.err }).toEqual({ code: 0, err: '' });
    for (const tbl of restrict) {
      const col = fks.find((f) => f.childTable === tbl && f.parentTable === USER_TABLE)!.childColumn;
      expect(await count(tbl, `where "${col}"::text = '${t.id}'`)).toBe(0);
    }
  });
});
