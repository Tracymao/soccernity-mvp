import * as dotenv from 'dotenv';
import * as path from 'path';
import * as readline from 'readline';
import { Writable } from 'stream';
import { isEmail } from 'class-validator';
import { Prisma, PrismaClient } from '@prisma/client';
import { PasswordService } from '../modules/auth/password/password.service';

// One-time bootstrap of the FIRST Admin Console account (Decision Log #191, build-register B-090 / runbook step 5.5).
//   node dist/scripts/create-first-superadmin.js --email you@example.com --full-name "Your Name"
//   (npm run create-first-superadmin -- --email ... --full-name ...)
//
// Why it exists: there is no self-registration and no seed for admins, so the first admin has to be a database row
// with an argon2id hash, and nothing else in the repo makes one. Every LATER admin is created from the Admin Console
// (POST /admin/staff, superadmin only). This command is NOT a second way to add admins and NOT a password reset.
//
// Safety properties:
//  - Refuses (non-zero exit, nothing written) if ANY superadmin already exists, in any account status, and if the
//    email is already used by any admin. The check and the insert run in ONE Serializable transaction, so two
//    runs at the same moment cannot both succeed.
//  - The PASSWORD is never a command-line argument (it would land in shell history and process lists). It is read
//    from FIRST_SUPERADMIN_PASSWORD, or typed at a prompt that does not echo (asked twice). `--password...` is refused.
//  - Validation is the Admin Console's own (CreateAdminStaffDto): email shape and at most 254 characters, full name
//    1 to 120 characters after trimming, password 8 to 128 characters. The email is trimmed and lower-cased, the full
//    name trimmed, exactly as AdminStaffRolesService.createStaff does.
//  - Hashes with PasswordService (the one argon2id hasher); no parameters are chosen here.
//  - --dry-run validates and inspects the database and writes nothing.
//  - Shows which database it will write to (host and database name only, never credentials) and asks for
//    confirmation unless --yes is given. A non-interactive run without --yes is refused.
//  - Never prints, logs or echoes the password or the hash. For an unexpected error only the error class and code
//    are printed, never the message (a database error can echo query values).
//  - Exit code 0 only when the row exists AND the stored hash verifies against the password given (a dry run exits 0
//    when everything checks out and nothing would block the real run).
//
// Reads the database from DATABASE_URL like the other scripts (root .env is loaded first; values already in the
// environment win, so on Render the injected variables are used).

export const ENV_EMAIL = 'FIRST_SUPERADMIN_EMAIL';
export const ENV_FULL_NAME = 'FIRST_SUPERADMIN_FULL_NAME';
export const ENV_PASSWORD = 'FIRST_SUPERADMIN_PASSWORD';

export const EMAIL_MAX_LENGTH = 254;
export const FULL_NAME_MAX_LENGTH = 120;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export interface BootstrapInput {
  email: string;
  fullName: string;
  password: string;
}

// Same rules as CreateAdminStaffDto + AdminStaffRolesService.createStaff. Returns every problem at once, never the
// password itself.
export function validateInput(raw: { email?: unknown; fullName?: unknown; password?: unknown }):
  | { ok: true; value: BootstrapInput }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : '';
  const fullName = typeof raw.fullName === 'string' ? raw.fullName.trim() : '';
  const password = typeof raw.password === 'string' ? raw.password : '';

  if (!email) errors.push('email is required');
  else if (email.length > EMAIL_MAX_LENGTH) errors.push(`email must be at most ${EMAIL_MAX_LENGTH} characters`);
  else if (!isEmail(email)) errors.push('email is not a valid email address');

  if (fullName.length < 1) errors.push('full name is required');
  else if (fullName.length > FULL_NAME_MAX_LENGTH) errors.push(`full name must be at most ${FULL_NAME_MAX_LENGTH} characters`);

  if (password.length === 0) errors.push('password is required');
  else if (password.length < PASSWORD_MIN_LENGTH) errors.push(`password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  else if (password.length > PASSWORD_MAX_LENGTH) errors.push(`password must be at most ${PASSWORD_MAX_LENGTH} characters`);

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: { email, fullName, password } };
}

export type RefusalCode = 'superadmin_exists' | 'email_exists' | 'concurrent_run';

export class BootstrapRefusal extends Error {
  constructor(readonly code: RefusalCode) {
    super(
      code === 'superadmin_exists'
        ? 'A superadmin account already exists. This command only creates the FIRST one; create further admins from the Admin Console (Settings > Roles).'
        : code === 'email_exists'
          ? 'An admin account with this email already exists.'
          : 'Another run changed the admin accounts at the same moment. Nothing was written by this run; check the database and run again if needed.',
    );
    this.name = 'BootstrapRefusal';
  }
}

export interface InspectResult {
  superadmins: number;
  emailTaken: boolean;
}

export interface StoredAdmin {
  id: string;
  email: string;
  role: string;
  accountStatus: string;
  passwordHash: string;
}

// The database behind a seam, so the logic is testable without Postgres. The real implementation is below.
export interface AdminBootstrapStore {
  inspect(email: string): Promise<InspectResult>;
  // ONE transaction: re-checks "no superadmin" and creates. Throws BootstrapRefusal when it must not write.
  createFirstSuperadmin(data: { email: string; fullName: string; passwordHash: string }): Promise<{ id: string; email: string }>;
  readBack(id: string): Promise<StoredAdmin | null>;
}

export interface Hasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
}

export class BootstrapVerificationError extends Error {
  constructor() {
    super('The account was written, but the stored row did not pass verification. Do not rely on it; check the database.');
    this.name = 'BootstrapVerificationError';
  }
}

export type BootstrapOutcome =
  | { status: 'dry_run'; email: string }
  | { status: 'created'; id: string; email: string };

export async function checkPreconditions(store: AdminBootstrapStore, email: string): Promise<void> {
  const state = await store.inspect(email);
  if (state.superadmins > 0) throw new BootstrapRefusal('superadmin_exists');
  if (state.emailTaken) throw new BootstrapRefusal('email_exists');
}

export async function createFirstSuperadmin(
  store: AdminBootstrapStore,
  hasher: Hasher,
  input: BootstrapInput,
): Promise<{ id: string; email: string }> {
  const passwordHash = await hasher.hash(input.password);
  const created = await store.createFirstSuperadmin({ email: input.email, fullName: input.fullName, passwordHash });
  const row = await store.readBack(created.id);
  const ok =
    row !== null &&
    row.role === 'superadmin' &&
    row.accountStatus === 'active' &&
    row.email === input.email &&
    row.passwordHash !== input.password &&
    (await hasher.verify(row.passwordHash, input.password));
  if (!ok) throw new BootstrapVerificationError();
  return created;
}

export function createPrismaStore(prisma: PrismaClient): AdminBootstrapStore {
  return {
    async inspect(email) {
      const [superadmins, existing] = await Promise.all([
        prisma.adminUser.count({ where: { role: 'superadmin' } }),
        prisma.adminUser.findUnique({ where: { email }, select: { id: true } }),
      ]);
      return { superadmins, emailTaken: existing !== null };
    },
    async createFirstSuperadmin(data) {
      try {
        return await prisma.$transaction(
          async (tx) => {
            if ((await tx.adminUser.count({ where: { role: 'superadmin' } })) > 0) throw new BootstrapRefusal('superadmin_exists');
            if ((await tx.adminUser.findUnique({ where: { email: data.email }, select: { id: true } })) !== null) {
              throw new BootstrapRefusal('email_exists');
            }
            return tx.adminUser.create({
              data: { ...data, role: 'superadmin', accountStatus: 'active' },
              select: { id: true, email: true },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (err) {
        if (err instanceof BootstrapRefusal) throw err;
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
          if (err.code === 'P2002') throw new BootstrapRefusal('email_exists');
          // P2034: the Serializable transaction lost a race with another writer.
          if (err.code === 'P2034') throw new BootstrapRefusal('concurrent_run');
        }
        throw err;
      }
    },
    readBack(id) {
      return prisma.adminUser.findUnique({
        where: { id },
        select: { id: true, email: true, role: true, accountStatus: true, passwordHash: true },
      });
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Command line.
// ---------------------------------------------------------------------------------------------------------------

export interface CliIo {
  argv: string[];
  env: Record<string, string | undefined>;
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  // True when the run can prompt (a real terminal). A run without one must give everything by variable and --yes.
  interactive: boolean;
}

export interface CliDeps {
  createStore?: (databaseUrl: string) => { store: AdminBootstrapStore; close: () => Promise<void> };
  hasher?: Hasher;
}

interface ParsedArgs {
  email?: string;
  fullName?: string;
  dryRun: boolean;
  yes: boolean;
  help: boolean;
}

const VALUE_FLAGS: Record<string, 'email' | 'fullName'> = { '--email': 'email', '--full-name': 'fullName' };

function parseArgs(argv: string[]): ParsedArgs | { error: string } {
  const out: ParsedArgs = { dryRun: false, yes: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.indexOf('=');
    const name = arg.startsWith('--') && eq > 0 ? arg.slice(0, eq) : arg;
    if (name.startsWith('--password')) {
      return { error: 'The password cannot be given as an argument (it would be kept in shell history). Set FIRST_SUPERADMIN_PASSWORD, or leave it out and type it at the prompt.' };
    }
    if (name === '--dry-run') out.dryRun = true;
    else if (name === '--yes') out.yes = true;
    else if (name === '--help' || name === '-h') out.help = true;
    else if (VALUE_FLAGS[name]) {
      const value = eq > 0 ? arg.slice(eq + 1) : argv[++i];
      if (value === undefined || value.startsWith('--')) return { error: `${name} needs a value.` };
      out[VALUE_FLAGS[name]] = value;
    } else {
      return { error: `Unknown argument: ${name.slice(0, 40)}` };
    }
  }
  return out;
}

const HELP = [
  'Creates the FIRST Admin Console account (a superadmin). One-time bootstrap only.',
  '',
  'Usage: node dist/scripts/create-first-superadmin.js --email <email> --full-name "<name>" [--dry-run] [--yes]',
  '',
  '  Password: set FIRST_SUPERADMIN_PASSWORD, or leave it out and type it at the prompt (hidden, asked twice).',
  '  Email and full name can also come from FIRST_SUPERADMIN_EMAIL and FIRST_SUPERADMIN_FULL_NAME.',
  '  --dry-run  check the inputs and the database, write nothing',
  '  --yes      skip the confirmation question (required when there is no terminal)',
  '  Database:  DATABASE_URL (the root .env is read first; variables already set win).',
  '  Refuses when any superadmin already exists or the email is already an admin.',
].join('\n');

// A line prompt. The question goes to `stdout`; `hidden` swallows the echo of what is typed.
export function askLine(
  question: string,
  io: Pick<CliIo, 'stdin' | 'stdout'>,
  hidden = false,
): Promise<string> {
  return new Promise((resolve) => {
    let muted = false;
    const output = new Writable({
      write(chunk, encoding, callback) {
        if (!muted) io.stdout.write(chunk, encoding as BufferEncoding);
        callback();
      },
    });
    // terminal: true makes readline echo through `output` itself (and lets the muted writer swallow it); a plain
    // question leaves the decision to readline.
    const rl = readline.createInterface({
      input: io.stdin,
      output: hidden ? output : io.stdout,
      ...(hidden ? { terminal: true } : {}),
    });
    let answered = false;
    rl.question(hidden ? '' : question, (answer) => {
      answered = true;
      muted = false;
      if (hidden) io.stdout.write('\n');
      rl.close();
      resolve(answer);
    });
    if (hidden) {
      io.stdout.write(question);
      muted = true;
    }
    // Input ended (Ctrl+D, closed pipe) without an answer: resolve empty so validation reports it.
    rl.on('close', () => {
      if (!answered) resolve('');
    });
  });
}

export function describeDatabase(databaseUrl: string): { host: string; database: string } | null {
  try {
    const url = new URL(databaseUrl);
    const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
    if (!url.host || !database) return null;
    return { host: url.host, database };
  } catch {
    return null;
  }
}

function defaultStore(databaseUrl: string): { store: AdminBootstrapStore; close: () => Promise<void> } {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  return { store: createPrismaStore(prisma), close: () => prisma.$disconnect() };
}

// Returns the process exit code. Nothing in here exits the process, so it can be driven from a test.
export async function runCli(io: CliIo, deps: CliDeps = {}): Promise<number> {
  const out = (line: string) => void io.stdout.write(line + '\n');
  const err = (line: string) => void io.stderr.write(line + '\n');

  const args = parseArgs(io.argv);
  if ('error' in args) {
    err(args.error);
    return 1;
  }
  if (args.help) {
    out(HELP);
    return 0;
  }

  const databaseUrl = io.env.DATABASE_URL;
  const target = databaseUrl ? describeDatabase(databaseUrl) : null;
  if (!databaseUrl || !target) {
    err('DATABASE_URL is not set or is not a valid database address. Nothing was done.');
    return 1;
  }

  // Resolve the three inputs: argument > variable > prompt (only with a terminal).
  let email = args.email ?? io.env[ENV_EMAIL];
  let fullName = args.fullName ?? io.env[ENV_FULL_NAME];
  let password = io.env[ENV_PASSWORD];
  if (io.interactive) {
    if (!email) email = await askLine('Email for the new admin: ', io);
    if (!fullName) fullName = await askLine('Full name: ', io);
    if (!password) {
      const first = await askLine('Password (hidden): ', io, true);
      const second = await askLine('Type the password again: ', io, true);
      if (first !== second) {
        err('The two passwords do not match. Nothing was done.');
        return 1;
      }
      password = first;
    }
  }

  const checked = validateInput({ email, fullName, password });
  if (!checked.ok) {
    for (const message of checked.errors) err(`Invalid input: ${message}.`);
    if (!io.interactive) {
      err(`Without a terminal, give the email and full name as arguments or ${ENV_EMAIL} / ${ENV_FULL_NAME}, and the password as ${ENV_PASSWORD}.`);
    }
    return 1;
  }
  const input = checked.value;

  const hasher = deps.hasher ?? new PasswordService();
  const { store, close } = (deps.createStore ?? defaultStore)(databaseUrl);
  try {
    out(`Database: ${target.database} on ${target.host}`);
    out(`New admin: ${input.email} (superadmin)`);

    try {
      await checkPreconditions(store, input.email);
    } catch (e) {
      if (e instanceof BootstrapRefusal) {
        err(`Refused: ${e.message}`);
        return 1;
      }
      throw e;
    }

    if (args.dryRun) {
      out('Dry run: the inputs are valid and nothing blocks the real run. Nothing was written.');
      return 0;
    }

    if (!args.yes) {
      if (!io.interactive) {
        err('There is no terminal to confirm on. Re-run with --yes once you have checked the database above. Nothing was written.');
        return 1;
      }
      const answer = (await askLine(`Type the database name (${target.database}) to create this account there: `, io)).trim();
      if (answer !== target.database) {
        err('Not confirmed. Nothing was written.');
        return 1;
      }
    }

    let created: { id: string; email: string };
    try {
      created = await createFirstSuperadmin(store, hasher, input);
    } catch (e) {
      if (e instanceof BootstrapRefusal) {
        err(`Refused: ${e.message}`);
        return 1;
      }
      if (e instanceof BootstrapVerificationError) {
        err(e.message);
        return 1;
      }
      throw e;
    }

    out(`Created superadmin ${created.email} (id ${created.id}). The stored password verified.`);
    out('Next: sign in to the Admin Console, then set up two-factor straight away (docs/first-superadmin.md, runbook step 6.2).');
    return 0;
  } finally {
    await close();
  }
}

async function main(): Promise<number> {
  dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
  const env = { ...process.env };
  // Do not leave the password sitting in this process's own environment while the database work runs.
  delete process.env[ENV_PASSWORD];
  return runCli({
    argv: process.argv.slice(2),
    env,
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
  });
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((e: unknown) => {
      // Only the class and code: a database error message can echo query values (the hash).
      const code = typeof (e as { code?: unknown })?.code === 'string' ? (e as { code: string }).code : 'none';
      console.error(`Unexpected error (${e instanceof Error ? e.name : 'unknown'}, code ${code}). Nothing more was done; check the database before running again.`);
      process.exit(1);
    });
}
