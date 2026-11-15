import { PassThrough, Writable } from 'stream';
import { PasswordService } from '../modules/auth/password/password.service';
import {
  AdminBootstrapStore,
  BootstrapRefusal,
  CliDeps,
  CliIo,
  StoredAdmin,
  askLine,
  createFirstSuperadmin,
  describeDatabase,
  runCli,
  validateInput,
} from './create-first-superadmin';

const PASSWORD = 'a-long-first-password-123';
const EMAIL = 'founder@example.com';
const NAME = 'Founder Name';
const DB_URL = 'postgresql://app_user:secret-db-pass@db.example.internal:5432/soccernity_prod?sslmode=require';

// Cheap, real argon2 would make every case slow; the production hasher is covered by the success-path test below.
const passwords = new PasswordService();

class FakeStore implements AdminBootstrapStore {
  rows: StoredAdmin[] = [];
  creates = 0;
  async inspect(email: string) {
    return { superadmins: this.rows.filter((r) => r.role === 'superadmin').length, emailTaken: this.rows.some((r) => r.email === email) };
  }
  async createFirstSuperadmin(data: { email: string; fullName: string; passwordHash: string }) {
    if (this.rows.some((r) => r.role === 'superadmin')) throw new BootstrapRefusal('superadmin_exists');
    if (this.rows.some((r) => r.email === data.email)) throw new BootstrapRefusal('email_exists');
    this.creates++;
    const row: StoredAdmin = { id: `id-${this.rows.length + 1}`, email: data.email, role: 'superadmin', accountStatus: 'active', passwordHash: data.passwordHash };
    this.rows.push(row);
    return { id: row.id, email: row.email };
  }
  async readBack(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
}

function sink() {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  return { stream, text: () => chunks.join('') };
}

function makeIo(over: Partial<CliIo> = {}) {
  const out = sink();
  const err = sink();
  const io: CliIo = {
    argv: ['--email', EMAIL, '--full-name', NAME],
    env: { DATABASE_URL: DB_URL, FIRST_SUPERADMIN_PASSWORD: PASSWORD },
    stdin: new PassThrough(),
    stdout: out.stream,
    stderr: err.stream,
    interactive: false,
    ...over,
  };
  return { io, all: () => out.text() + err.text(), out: out.text, err: err.text };
}

function depsFor(store: FakeStore): CliDeps {
  return { createStore: () => ({ store, close: async () => undefined }) };
}

describe('validateInput (the Admin Console rules)', () => {
  it('accepts a good set and normalises like createStaff: email trimmed and lower-cased, name trimmed', () => {
    const res = validateInput({ email: '  Founder@Example.COM ', fullName: '  Founder Name  ', password: PASSWORD });
    expect(res).toEqual({ ok: true, value: { email: 'founder@example.com', fullName: 'Founder Name', password: PASSWORD } });
  });

  it.each([
    ['bad email shape', { email: 'not-an-email', fullName: NAME, password: PASSWORD }, 'email is not a valid email address'],
    ['blank email', { email: '   ', fullName: NAME, password: PASSWORD }, 'email is required'],
    ['email over 254', { email: `${'a'.repeat(250)}@x.co`, fullName: NAME, password: PASSWORD }, 'email must be at most 254 characters'],
    ['blank name', { email: EMAIL, fullName: '   ', password: PASSWORD }, 'full name is required'],
    ['name over 120', { email: EMAIL, fullName: 'n'.repeat(121), password: PASSWORD }, 'full name must be at most 120 characters'],
    ['short password', { email: EMAIL, fullName: NAME, password: '1234567' }, 'password must be at least 8 characters'],
    ['no password', { email: EMAIL, fullName: NAME, password: undefined }, 'password is required'],
    ['password over 128', { email: EMAIL, fullName: NAME, password: 'p'.repeat(129) }, 'password must be at most 128 characters'],
  ])('rejects %s', (_label, input, message) => {
    const res = validateInput(input);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors).toContain(message);
  });

  it('accepts exactly 8 and exactly 128 character passwords, and a 120 character name', () => {
    expect(validateInput({ email: EMAIL, fullName: 'n'.repeat(120), password: '12345678' }).ok).toBe(true);
    expect(validateInput({ email: EMAIL, fullName: NAME, password: 'p'.repeat(128) }).ok).toBe(true);
  });

  it('never echoes the password in an error', () => {
    const res = validateInput({ email: 'bad', fullName: '', password: 'short' });
    expect(JSON.stringify(res)).not.toContain('short');
  });
});

describe('describeDatabase', () => {
  it('returns host and database only, never the user or password', () => {
    const d = describeDatabase(DB_URL);
    expect(d).toEqual({ host: 'db.example.internal:5432', database: 'soccernity_prod' });
    expect(JSON.stringify(d)).not.toContain('secret-db-pass');
    expect(JSON.stringify(d)).not.toContain('app_user');
  });
  it('returns null for something that is not a database address', () => {
    expect(describeDatabase('not a url')).toBeNull();
    expect(describeDatabase('postgresql://host-only')).toBeNull();
  });
});

describe('createFirstSuperadmin (the success path, real argon2id)', () => {
  it('writes exactly one superadmin, active, with a hash PasswordService accepts and that is not the plaintext', async () => {
    const store = new FakeStore();
    const created = await createFirstSuperadmin(store, passwords, { email: EMAIL, fullName: NAME, password: PASSWORD });
    expect(store.rows).toHaveLength(1);
    const row = store.rows[0];
    expect(created).toEqual({ id: row.id, email: EMAIL });
    expect(row.role).toBe('superadmin');
    expect(row.accountStatus).toBe('active');
    expect(row.passwordHash).not.toBe(PASSWORD);
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await passwords.verify(row.passwordHash, PASSWORD)).toBe(true);
    expect(await passwords.verify(row.passwordHash, 'a-different-password')).toBe(false);
  });

  it('fails verification (and so the command) when the stored hash does not match', async () => {
    const store = new FakeStore();
    const orig = store.createFirstSuperadmin.bind(store);
    store.createFirstSuperadmin = async (data) => orig({ ...data, passwordHash: await passwords.hash('something-else-entirely') });
    await expect(createFirstSuperadmin(store, passwords, { email: EMAIL, fullName: NAME, password: PASSWORD })).rejects.toThrow(/did not pass verification/);
  });
});

describe('runCli', () => {
  it('creates the account, exits 0, prints id, email and the next step, and never the password or the hash', async () => {
    const store = new FakeStore();
    const { io, all, out } = makeIo({ argv: ['--email', EMAIL, '--full-name', NAME, '--yes'] });
    expect(await runCli(io, { ...depsFor(store), hasher: passwords })).toBe(0);
    expect(store.rows).toHaveLength(1);
    expect(out()).toContain(EMAIL);
    expect(out()).toContain('id-1');
    expect(out()).toMatch(/two-factor/i);
    expect(out()).toContain('soccernity_prod on db.example.internal:5432');
    expect(all()).not.toContain(PASSWORD);
    expect(all()).not.toContain(store.rows[0].passwordHash);
    expect(all()).not.toContain('secret-db-pass');
    expect(all()).not.toContain('$argon2');
  });

  it('refuses when a superadmin already exists (any account status), writes nothing, exits 1', async () => {
    const store = new FakeStore();
    store.rows.push({ id: 'old', email: 'someone@example.com', role: 'superadmin', accountStatus: 'deactivated', passwordHash: 'x' });
    const { io, err } = makeIo({ argv: ['--email', EMAIL, '--full-name', NAME, '--yes'] });
    expect(await runCli(io, depsFor(store))).toBe(1);
    expect(store.creates).toBe(0);
    expect(err()).toMatch(/superadmin account already exists/);
  });

  it('refuses when the email is already used by any admin (even a non-superadmin), writes nothing, exits 1', async () => {
    const store = new FakeStore();
    store.rows.push({ id: 'ed', email: EMAIL, role: 'editor', accountStatus: 'active', passwordHash: 'x' });
    const { io, err } = makeIo({ argv: ['--email', EMAIL.toUpperCase(), '--full-name', NAME, '--yes'] });
    expect(await runCli(io, depsFor(store))).toBe(1);
    expect(store.creates).toBe(0);
    expect(err()).toMatch(/already exists/);
  });

  it('turns a refusal that happens inside the write transaction (a concurrent run) into a clean exit 1', async () => {
    const store = new FakeStore();
    store.createFirstSuperadmin = async () => {
      throw new BootstrapRefusal('concurrent_run');
    };
    const { io, err } = makeIo({ argv: ['--email', EMAIL, '--full-name', NAME, '--yes'] });
    expect(await runCli(io, { ...depsFor(store), hasher: passwords })).toBe(1);
    expect(err()).toMatch(/Nothing was written by this run/);
  });

  it('--dry-run validates and inspects, writes nothing, hashes nothing, exits 0', async () => {
    const store = new FakeStore();
    const hasher = { hash: jest.fn(), verify: jest.fn() };
    const { io, out, all } = makeIo({ argv: ['--email', EMAIL, '--full-name', NAME, '--dry-run'] });
    expect(await runCli(io, { ...depsFor(store), hasher })).toBe(0);
    expect(store.creates).toBe(0);
    expect(store.rows).toHaveLength(0);
    expect(hasher.hash).not.toHaveBeenCalled();
    expect(out()).toMatch(/Dry run/);
    expect(all()).not.toContain(PASSWORD);
  });

  it('--dry-run still refuses (exit 1) when the real run would be refused', async () => {
    const store = new FakeStore();
    store.rows.push({ id: 'old', email: 'someone@example.com', role: 'superadmin', accountStatus: 'active', passwordHash: 'x' });
    const { io } = makeIo({ argv: ['--email', EMAIL, '--full-name', NAME, '--dry-run'] });
    expect(await runCli(io, depsFor(store))).toBe(1);
  });

  it('refuses the password as an argument, before anything else, and does not repeat it', async () => {
    const store = new FakeStore();
    const secret = 'typed-on-the-command-line';
    for (const arg of [['--password', secret], [`--password=${secret}`]]) {
      const { io, err, all } = makeIo({ argv: ['--email', EMAIL, '--full-name', NAME, ...arg] });
      expect(await runCli(io, depsFor(store))).toBe(1);
      expect(err()).toMatch(/cannot be given as an argument/);
      expect(all()).not.toContain(secret);
    }
    expect(store.creates).toBe(0);
  });

  it('reports every invalid input at once, exits 1, writes nothing, never prints the password', async () => {
    const store = new FakeStore();
    const { io, err, all } = makeIo({
      argv: ['--email', 'nope', '--full-name', ' '],
      env: { DATABASE_URL: DB_URL, FIRST_SUPERADMIN_PASSWORD: 'short' },
    });
    expect(await runCli(io, depsFor(store))).toBe(1);
    expect(err()).toMatch(/email is not a valid/);
    expect(err()).toMatch(/full name is required/);
    expect(err()).toMatch(/password must be at least 8/);
    expect(all()).not.toContain('short\n');
    expect(store.rows).toHaveLength(0);
  });

  it('refuses without --yes when there is no terminal to confirm on', async () => {
    const store = new FakeStore();
    const { io, err } = makeIo();
    expect(await runCli(io, depsFor(store))).toBe(1);
    expect(err()).toMatch(/--yes/);
    expect(store.creates).toBe(0);
  });

  it('refuses when DATABASE_URL is missing or unusable', async () => {
    const store = new FakeStore();
    for (const url of [undefined, 'garbage']) {
      const { io, err } = makeIo({ env: { DATABASE_URL: url, FIRST_SUPERADMIN_PASSWORD: PASSWORD } });
      expect(await runCli(io, depsFor(store))).toBe(1);
      expect(err()).toMatch(/DATABASE_URL/);
    }
  });

  it('reads email and name from the environment too', async () => {
    const store = new FakeStore();
    const { io } = makeIo({
      argv: ['--yes'],
      env: { DATABASE_URL: DB_URL, FIRST_SUPERADMIN_PASSWORD: PASSWORD, FIRST_SUPERADMIN_EMAIL: EMAIL, FIRST_SUPERADMIN_FULL_NAME: NAME },
    });
    expect(await runCli(io, { ...depsFor(store), hasher: passwords })).toBe(0);
    expect(store.rows[0].email).toBe(EMAIL);
  });

  it('rejects an unknown argument', async () => {
    const { io, err } = makeIo({ argv: ['--make-admin'] });
    expect(await runCli(io, depsFor(new FakeStore()))).toBe(1);
    expect(err()).toMatch(/Unknown argument/);
  });

  it('closes the database connection on every path', async () => {
    const store = new FakeStore();
    const close = jest.fn(async () => undefined);
    store.rows.push({ id: 'old', email: 'x@example.com', role: 'superadmin', accountStatus: 'active', passwordHash: 'x' });
    const { io } = makeIo({ argv: ['--email', EMAIL, '--full-name', NAME, '--yes'] });
    await runCli(io, { createStore: () => ({ store, close }) });
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe('runCli: the interactive path (fake streams, not a real terminal)', () => {
  function typeInto(stdin: PassThrough, lines: string[]) {
    // Feed answers one at a time so each readline interface sees its own line.
    let i = 0;
    const feed = () => {
      if (i < lines.length) stdin.write(lines[i++] + '\n');
    };
    return feed;
  }

  it('asks for the password twice, hidden, and stops when they differ', async () => {
    const store = new FakeStore();
    const stdin = new PassThrough();
    const { io, err, all } = makeIo({ stdin, interactive: true, env: { DATABASE_URL: DB_URL }, argv: ['--email', EMAIL, '--full-name', NAME] });
    const feed = typeInto(stdin, ['first-password-1', 'second-password-2']);
    setImmediate(feed);
    const origWrite = io.stdout.write.bind(io.stdout);
    (io.stdout as any).write = (chunk: any, ...rest: any[]) => {
      if (String(chunk).includes('Type the password again')) setImmediate(feed);
      return origWrite(chunk, ...rest);
    };
    expect(await runCli(io, depsFor(store))).toBe(1);
    expect(err()).toMatch(/do not match/);
    expect(all()).not.toContain('first-password-1');
    expect(all()).not.toContain('second-password-2');
    expect(store.rows).toHaveLength(0);
  });

  it('a hidden prompt does not echo what is typed', async () => {
    const stdin = new PassThrough();
    const out = sink();
    const promise = askLine('Password (hidden): ', { stdin, stdout: out.stream }, true);
    setImmediate(() => stdin.write('my-very-secret-value\n'));
    expect(await promise).toBe('my-very-secret-value');
    expect(out.text()).toContain('Password (hidden): ');
    expect(out.text()).not.toContain('my-very-secret-value');
  });

  it('a plain prompt returns what was typed and an empty answer when input ends', async () => {
    const stdin = new PassThrough();
    const out = sink();
    const first = askLine('Email: ', { stdin, stdout: out.stream });
    setImmediate(() => stdin.write('a@b.co\n'));
    expect(await first).toBe('a@b.co');

    const stdin2 = new PassThrough();
    const second = askLine('Email: ', { stdin: stdin2, stdout: out.stream });
    setImmediate(() => stdin2.end());
    expect(await second).toBe('');
  });

  it('asks the founder to type the database name; anything else writes nothing', async () => {
    const store = new FakeStore();
    const stdin = new PassThrough();
    const { io, err } = makeIo({ stdin, interactive: true });
    setImmediate(() => stdin.write('yes\n'));
    expect(await runCli(io, depsFor(store))).toBe(1);
    expect(err()).toMatch(/Not confirmed/);
    expect(store.creates).toBe(0);
  });

  it('writes when the database name is typed correctly', async () => {
    const store = new FakeStore();
    const stdin = new PassThrough();
    const { io } = makeIo({ stdin, interactive: true });
    setImmediate(() => stdin.write('soccernity_prod\n'));
    expect(await runCli(io, { ...depsFor(store), hasher: passwords })).toBe(0);
    expect(store.rows).toHaveLength(1);
  });
});
