import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { Readable, Writable } from 'stream';
import { PrismaClient } from '@prisma/client';

// R110: removes NAMED test users (and everything that blocks removing them) from a STAGING database.
//   node dist/scripts/delete-test-users.js --email a@example.com --email b@example.com --expect-database=<name>            (dry run)
//   node dist/scripts/delete-test-users.js --emails-file list.txt --expect-database=<name> --execute --confirm=<count>
//   (npm run delete-test-users -- ...)
//
// Why it exists: about 40 tables point at "User" and many of them are ON DELETE RESTRICT (Report.reporter,
// AccountHold.user, ContactEnquiry.user, PostView.viewer, MatchSubscription.user, GrassrootsTeam.createdBy, ...), so a
// test account cannot be deleted from a database console. The supported route (pending deletion, 30-day grace, nightly
// anonymisation, later purge) is too slow for test data. This is NOT an account-deletion feature and must never run
// against production.
//
// How it works (nothing here is a hand-kept table list):
//  - The foreign-key graph is read from pg_catalog at run time, so a table added tomorrow is covered.
//  - Starting from the listed users, every row that references a row already in the delete set is added, level by level
//    (CASCADE and RESTRICT edges alike, so a RESTRICT blocker hiding under a CASCADE row is still found).
//  - Rows are identified by ctid, so tables with composite or no primary key (join tables) work.
//  - Deletion runs in ONE transaction, deepest rows first; a row blocked by another still-present row is retried after the
//    others (savepoints), and if nothing can make progress the whole transaction rolls back.
//
// Safety properties:
//  - DRY RUN is the default and runs in a READ ONLY transaction. Executing needs BOTH --execute and --confirm=<number of users>.
//  - --expect-database=<name> is required and must equal the connected database name. Refuses when NODE_ENV=production.
//  - Only exact emails (no wildcard, no "all"). Refuses an empty list.
//  - Refuses (before any write) a user linked to an AdminUser; a user who is the guardian (by email) of a minor outside the
//    list; and, unless --include-others-content, content that OTHER (non-listed) users interacted with.
//  - A RESTRICT row that belongs to someone else (a Report the test user filed about someone else's content) is kept: its
//    column is set to NULL when the schema allows it, otherwise the run refuses.
//  - Never prints the connection string, host, user or password: only the database NAME. Errors print only a table and
//    constraint name, never row values (a database message can echo them).
//  - R2 and Redis are NOT touched; the keys that would be orphaned are listed as a to-do.
//  - On success one summary line (time, database name, users, rows per table) goes to stdout. No emails, no ids, and no
//    AdminActionLog row (these are test accounts, not support actions).

export const USER_TABLE = 'User';
export const ADMIN_TABLE = 'AdminUser';
export const MAX_USERS = 200;

// ---------------------------------------------------------------------------------------------------------------
// SQL helpers and the foreign-key graph.
// ---------------------------------------------------------------------------------------------------------------

export const ident = (name: string): string => `"${name.replace(/"/g, '""')}"`;

export type DeleteAction = 'cascade' | 'restrict' | 'set_null';

export interface ForeignKey {
  name: string;
  childTable: string;
  childColumn: string;
  childType: string;
  childNullable: boolean;
  parentTable: string;
  parentColumn: string;
  onDelete: DeleteAction;
  composite: boolean;
}

// The only thing the logic needs from the database. The real implementation wraps a Prisma transaction client.
export interface Sql {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<number>;
}

const FK_QUERY = `
  select c.conname::text as name,
         cl.relname::text as "childTable", ca.attname::text as "childColumn",
         format_type(ca.atttypid, ca.atttypmod)::text as "childType", (not ca.attnotnull) as "childNullable",
         pl.relname::text as "parentTable", pa.attname::text as "parentColumn",
         c.confdeltype::text as "deltype", (array_length(c.conkey, 1) > 1) as composite
  from pg_constraint c
  join pg_class cl on cl.oid = c.conrelid
  join pg_namespace n on n.oid = cl.relnamespace and n.nspname = 'public'
  join pg_class pl on pl.oid = c.confrelid
  join pg_attribute ca on ca.attrelid = c.conrelid and ca.attnum = c.conkey[1]
  join pg_attribute pa on pa.attrelid = c.confrelid and pa.attnum = c.confkey[1]
  where c.contype = 'f'
  order by 2, 3`;

export async function loadForeignKeys(sql: Sql): Promise<ForeignKey[]> {
  const rows = await sql.query<{
    name: string; childTable: string; childColumn: string; childType: string; childNullable: boolean;
    parentTable: string; parentColumn: string; deltype: string; composite: boolean;
  }>(FK_QUERY);
  return rows.map((r) => ({
    name: r.name,
    childTable: r.childTable,
    childColumn: r.childColumn,
    childType: r.childType,
    childNullable: r.childNullable,
    parentTable: r.parentTable,
    parentColumn: r.parentColumn,
    // c = CASCADE, n/d = SET NULL / SET DEFAULT (the database handles them), a/r = NO ACTION / RESTRICT.
    onDelete: r.deltype === 'c' ? 'cascade' : r.deltype === 'n' || r.deltype === 'd' ? 'set_null' : 'restrict',
    composite: r.composite,
  }));
}

// ---------------------------------------------------------------------------------------------------------------
// Discovery.
// ---------------------------------------------------------------------------------------------------------------

export interface TargetUser {
  id: string;
  email: string;
  accountStatus: string;
  createdAt: Date;
}

export type TableAction = 'delete_target' | 'cascade' | 'delete_first' | 'set_null' | 'refuse';

export interface Finding {
  kind: 'others_content' | 'foreign_not_nullable';
  table: string;
  column: string;
  constraint: string;
  count: number;
}

export interface SetNull {
  table: string;
  column: string;
  constraint: string;
  ctids: string[];
}

export interface Plan {
  // ctid -> true, per table, in the order tables were first reached (parents before children).
  rows: Map<string, Set<string>>;
  // How each table entered the set, for the report: the strongest action wins (refuse > delete_first > cascade).
  actions: Map<string, Set<TableAction>>;
  setNulls: SetNull[];
  findings: Finding[];
  // Hard refusals found during discovery that no flag overrides.
  refusals: string[];
}

export interface DiscoverOptions {
  includeOthersContent: boolean;
}

export class Refusal extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'Refusal';
  }
}

const textArray = (values: string[]) => values;

export async function discover(sql: Sql, fks: ForeignKey[], targets: TargetUser[], _opts: DiscoverOptions): Promise<Plan> {
  const listedIds = new Set(targets.map((t) => t.id));
  const userFks = new Map<string, ForeignKey[]>(); // child table -> FKs that point at User
  const byParent = new Map<string, ForeignKey[]>();
  for (const fk of fks) {
    if (!byParent.has(fk.parentTable)) byParent.set(fk.parentTable, []);
    byParent.get(fk.parentTable)!.push(fk);
    if (fk.parentTable === USER_TABLE && fk.childTable !== USER_TABLE) {
      if (!userFks.has(fk.childTable)) userFks.set(fk.childTable, []);
      userFks.get(fk.childTable)!.push(fk);
    }
  }

  const plan: Plan = { rows: new Map(), actions: new Map(), setNulls: [], findings: [], refusals: [] };
  const addAction = (table: string, a: TableAction) => {
    if (!plan.actions.has(table)) plan.actions.set(table, new Set());
    plan.actions.get(table)!.add(a);
  };
  const addRows = (table: string, ctids: string[]): string[] => {
    if (!plan.rows.has(table)) plan.rows.set(table, new Set());
    const have = plan.rows.get(table)!;
    const fresh: string[] = [];
    for (const c of ctids) if (!have.has(c)) { have.add(c); fresh.push(c); }
    return fresh;
  };

  // Level 0: the users themselves.
  const userCtids = await sql.query<{ ctid: string }>(
    `select ctid::text as ctid from ${ident(USER_TABLE)} where id::text = any($1::text[])`,
    [textArray([...listedIds])],
  );
  addRows(USER_TABLE, userCtids.map((r) => r.ctid));
  addAction(USER_TABLE, 'delete_target');

  let frontier: Array<{ table: string; ctids: string[] }> = [{ table: USER_TABLE, ctids: userCtids.map((r) => r.ctid) }];
  const tablesTouchedBySetNull = new Map<string, SetNull>();

  while (frontier.length > 0) {
    const next: Array<{ table: string; ctids: string[] }> = [];
    for (const { table, ctids } of frontier) {
      for (const fk of byParent.get(table) ?? []) {
        if (fk.composite) {
          plan.refusals.push(`Composite foreign key ${fk.name} points into ${table}; this script does not handle it.`);
          continue;
        }
        if (fk.onDelete === 'set_null') continue; // the database nulls the column itself
        const parentValues = await sql.query<{ v: string }>(
          `select distinct ${ident(fk.parentColumn)}::text as v from ${ident(table)} where ctid = any($1::text[]::tid[]) and ${ident(fk.parentColumn)} is not null`,
          [ctids],
        );
        if (parentValues.length === 0) continue;
        const ownerCols = (userFks.get(fk.childTable) ?? []).filter((u) => u.childColumn !== fk.childColumn || fk.parentTable !== USER_TABLE);
        const selectCols = ['ctid::text as ctid', ...ownerCols.map((u, i) => `${ident(u.childColumn)}::text as o${i}`)];
        const children = await sql.query<Record<string, string | null>>(
          `select ${selectCols.join(', ')} from ${ident(fk.childTable)} where ${ident(fk.childColumn)} = any($1::text[]::${fk.childType}[])`,
          [parentValues.map((p) => p.v)],
        );
        const accepted: string[] = [];
        const foreignCtids: string[] = [];
        const keepCtids: string[] = [];
        for (const row of children) {
          const foreign = ownerCols.some((_, i) => {
            const v = row[`o${i}`];
            return v !== null && v !== undefined && !listedIds.has(v);
          });
          const viaUser = fk.parentTable === USER_TABLE;
          if (!viaUser && foreign) {
            // Another (non-listed) user's row hangs off the test user's content: the "others interacted" case.
            foreignCtids.push(row.ctid as string);
            accepted.push(row.ctid as string); // counted for the report; the run is refused without the flag
          } else if (viaUser && fk.onDelete === 'restrict' && fk.childNullable && KEEP_OTHER_PARTY.has(`${fk.childTable}.${fk.childColumn}`)) {
            keepCtids.push(row.ctid as string);
          } else {
            accepted.push(row.ctid as string);
          }
        }
        if (foreignCtids.length > 0) {
          plan.findings.push({ kind: 'others_content', table: fk.childTable, column: fk.childColumn, constraint: fk.name, count: foreignCtids.length });
        }
        if (keepCtids.length > 0) {
          const key = `${fk.childTable}.${fk.childColumn}`;
          const cur = tablesTouchedBySetNull.get(key) ?? { table: fk.childTable, column: fk.childColumn, constraint: fk.name, ctids: [] };
          cur.ctids.push(...keepCtids);
          tablesTouchedBySetNull.set(key, cur);
        }
        const fresh = addRows(fk.childTable, accepted);
        if (fresh.length > 0) {
          addAction(fk.childTable, fk.onDelete === 'cascade' ? 'cascade' : 'delete_first');
          next.push({ table: fk.childTable, ctids: fresh });
        }
      }
    }
    frontier = next;
  }

  // Rows the Report rule keeps are only kept if the report is NOT about the test users' own content.
  await resolveKeptReports(sql, plan, listedIds, [...tablesTouchedBySetNull.values()]);
  return plan;
}

// A Report the test user FILED about someone else's content is the other party's case record: keep it and clear the
// reporter. A Report about the test user's own content (or the user) goes with them. Report.targetId is a bare string,
// so this is the one place that knows the shape (targetType 'user' | 'post' | 'comment' | 'message', ...).
export const KEEP_OTHER_PARTY = new Set<string>(['Report.reporterId']);

async function resolveKeptReports(sql: Sql, plan: Plan, listedIds: Set<string>, candidates: SetNull[]): Promise<void> {
  for (const cand of candidates) {
    if (cand.table !== 'Report') {
      plan.setNulls.push(cand);
      continue;
    }
    const rows = await sql.query<{ ctid: string; targetType: string; targetId: string }>(
      `select ctid::text as ctid, "targetType"::text as "targetType", "targetId"::text as "targetId" from "Report" where ctid = any($1::text[]::tid[])`,
      [cand.ctids],
    );
    const inSet = (table: string, id: string) =>
      sql.query<{ ctid: string }>(`select ctid::text as ctid from ${ident(table)} where id::text = $1`, [id]).then((r) =>
        r.some((x) => plan.rows.get(table)?.has(x.ctid)),
      );
    const keep: string[] = [];
    const drop: string[] = [];
    for (const r of rows) {
      const tableByType: Record<string, string> = { user: USER_TABLE, post: 'Post', comment: 'Comment', message: 'Message' };
      const table = tableByType[r.targetType];
      const own = table ? await inSet(table, r.targetId) : false;
      (own ? drop : keep).push(r.ctid);
    }
    if (drop.length > 0) {
      const fresh: string[] = [];
      const have = plan.rows.get('Report') ?? new Set<string>();
      for (const c of drop) if (!have.has(c)) fresh.push(c);
      if (!plan.rows.has('Report')) plan.rows.set('Report', new Set());
      for (const c of fresh) plan.rows.get('Report')!.add(c);
      if (!plan.actions.has('Report')) plan.actions.set('Report', new Set());
      plan.actions.get('Report')!.add('delete_first');
    }
    if (keep.length > 0) plan.setNulls.push({ ...cand, ctids: keep });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Preconditions on the users themselves.
// ---------------------------------------------------------------------------------------------------------------

export async function loadTargets(sql: Sql, emails: string[]): Promise<{ found: TargetUser[]; notFound: string[] }> {
  const rows = await sql.query<{ id: string; email: string; accountStatus: string; createdAt: Date }>(
    `select id::text as id, email::text as email, "accountStatus"::text as "accountStatus", "createdAt" from ${ident(USER_TABLE)} where lower(email) = any($1::text[])`,
    [emails],
  );
  const foundEmails = new Set(rows.map((r) => r.email.toLowerCase()));
  return {
    found: rows.map((r) => ({ id: r.id, email: r.email.toLowerCase(), accountStatus: r.accountStatus, createdAt: new Date(r.createdAt) })),
    notFound: emails.filter((e) => !foundEmails.has(e)),
  };
}

// Refusals that no flag overrides. Returns plain sentences without any row data except the number of accounts.
export async function checkUserSafeguards(sql: Sql, fks: ForeignKey[], targets: TargetUser[]): Promise<string[]> {
  const out: string[] = [];
  const ids = targets.map((t) => t.id);
  const emails = targets.map((t) => t.email);

  const admins = await sql.query<{ c: string }>(`select count(*)::text as c from ${ident(ADMIN_TABLE)} where lower(email) = any($1::text[])`, [emails]);
  if (Number(admins[0]?.c ?? 0) > 0) out.push(`${admins[0].c} listed email(s) belong to an Admin Console account (AdminUser). Admin accounts are never touched.`);

  for (const fk of fks.filter((f) => f.childTable === ADMIN_TABLE && f.parentTable === USER_TABLE)) {
    const r = await sql.query<{ c: string }>(`select count(*)::text as c from ${ident(ADMIN_TABLE)} where ${ident(fk.childColumn)}::text = any($1::text[])`, [ids]);
    if (Number(r[0]?.c ?? 0) > 0) out.push(`An AdminUser is linked to a listed user through ${ADMIN_TABLE}.${fk.childColumn}.`);
  }
  for (const fk of fks.filter((f) => f.childTable === USER_TABLE && f.parentTable === ADMIN_TABLE)) {
    const r = await sql.query<{ c: string }>(
      `select count(*)::text as c from ${ident(USER_TABLE)} where id::text = any($1::text[]) and ${ident(fk.childColumn)} is not null`,
      [ids],
    );
    if (Number(r[0]?.c ?? 0) > 0) out.push(`A listed user is linked to an AdminUser through ${USER_TABLE}.${fk.childColumn}.`);
  }

  // Guardian rows are keyed by email: a listed email can be the guardian of a minor who is not being deleted.
  const guardians = await sql.query<{ c: string }>(
    `select count(*)::text as c from "Guardian" where lower(email) = any($1::text[]) and "minorUserId"::text <> all($2::text[])`,
    [emails, ids],
  );
  if (Number(guardians[0]?.c ?? 0) > 0) {
    out.push(`${guardians[0].c} minor account(s) outside the list have a listed email as their guardian. Add those accounts to the list, or remove this email.`);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Counts, object-store keys and execution.
// ---------------------------------------------------------------------------------------------------------------

export function rowCounts(plan: Plan): Array<{ table: string; count: number }> {
  return [...plan.rows.entries()].map(([table, set]) => ({ table, count: set.size })).filter((r) => r.count > 0);
}

export const OBJECT_PREFIXES = [
  'private-media', 'private-profile', 'quarantine', 'data-export', // private bucket
  'post-media', 'profile-media', 'media', // public bucket
  'avatars', 'covers', // legacy
];

const KEY_COLUMNS = ['privateKey', 'publicKey', 'avatarKey', 'coverKey', 'objectKey', 'key', 'storageKey'];

export async function objectKeysInPlan(sql: Sql, plan: Plan): Promise<string[]> {
  const keys = new Set<string>();
  for (const [table, ctids] of plan.rows.entries()) {
    if (ctids.size === 0) continue;
    const cols = await sql.query<{ column_name: string }>(
      `select column_name::text as column_name from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = any($2::text[])`,
      [table, KEY_COLUMNS],
    );
    for (const { column_name } of cols) {
      const rows = await sql.query<{ v: string }>(
        `select ${ident(column_name)}::text as v from ${ident(table)} where ctid = any($1::text[]::tid[]) and ${ident(column_name)} is not null`,
        [[...ctids]],
      );
      for (const r of rows) keys.add(r.v);
    }
  }
  return [...keys].sort();
}

export class DeletionBlocked extends Error {
  constructor(readonly table: string, readonly constraint: string | null) {
    super(`Could not delete rows from ${table}${constraint ? `: constraint ${constraint} still has a reference` : ''}.`);
    this.name = 'DeletionBlocked';
  }
}

// Only a table and a constraint name are ever taken from a database error: its text can contain row values.
export function describeDbError(e: unknown): { table: string | null; constraint: string | null; sqlState: string | null } {
  const meta = (e as { meta?: { code?: string; message?: string } })?.meta;
  const message = typeof meta?.message === 'string' ? meta.message : typeof (e as Error)?.message === 'string' ? (e as Error).message : '';
  const constraint = /constraint "([^"]+)"/.exec(message)?.[1] ?? null;
  const table = /on table "([^"]+)"/.exec(message)?.[1] ?? /table "([^"]+)"/.exec(message)?.[1] ?? null;
  const sqlState = meta?.code ?? (typeof (e as { code?: unknown })?.code === 'string' ? (e as { code: string }).code : null);
  return { table, constraint, sqlState };
}

export async function applyPlan(sql: Sql, plan: Plan): Promise<Map<string, number>> {
  const deleted = new Map<string, number>();

  for (const sn of plan.setNulls) {
    try {
      await sql.execute(`update ${ident(sn.table)} set ${ident(sn.column)} = null where ctid = any($1::text[]::tid[])`, [sn.ctids]);
    } catch (e) {
      const d = describeDbError(e);
      throw new DeletionBlocked(sn.table, d.constraint ?? sn.constraint);
    }
  }

  // Deepest first: reverse of the order tables were reached. Any table still blocked is retried after the others.
  let pending = [...plan.rows.entries()].reverse().filter(([, s]) => s.size > 0).map(([t, s]) => ({ table: t, ctids: [...s] }));
  let lastBlock: { table: string; constraint: string | null } | null = null;
  let round = 0;
  while (pending.length > 0) {
    const stillBlocked: typeof pending = [];
    for (const item of pending) {
      await sql.execute('savepoint r110_step');
      try {
        const n = await sql.execute(`delete from ${ident(item.table)} where ctid = any($1::text[]::tid[])`, [item.ctids]);
        deleted.set(item.table, (deleted.get(item.table) ?? 0) + n);
        await sql.execute('release savepoint r110_step');
      } catch (e) {
        await sql.execute('rollback to savepoint r110_step');
        const d = describeDbError(e);
        if (d.sqlState !== '23503' && d.sqlState !== 'P2003') throw new DeletionBlocked(item.table, d.constraint);
        lastBlock = { table: d.table ?? item.table, constraint: d.constraint };
        stillBlocked.push(item);
      }
    }
    if (stillBlocked.length === pending.length && ++round > 0 && stillBlocked.length > 0) {
      // No progress in a whole pass.
      throw new DeletionBlocked(lastBlock?.table ?? stillBlocked[0].table, lastBlock?.constraint ?? null);
    }
    pending = stillBlocked;
  }
  return deleted;
}

// ---------------------------------------------------------------------------------------------------------------
// Command line.
// ---------------------------------------------------------------------------------------------------------------

export interface CliIo {
  argv: string[];
  env: Record<string, string | undefined>;
  stdin: Readable;
  stdout: Writable;
  stderr: Writable;
  readFile?: (p: string) => string;
  now?: () => Date;
}

export interface Session {
  // Runs `work` in ONE transaction. readOnly transactions are rolled back by the database itself on any write attempt.
  transaction<T>(readOnly: boolean, work: (sql: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface CliDeps {
  openSession?: (databaseUrl: string) => Session;
}

interface ParsedArgs {
  emails: string[];
  emailsFile?: string;
  expectDatabase?: string;
  execute: boolean;
  confirm?: string;
  allowMissing: boolean;
  includeOthersContent: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs | { error: string } {
  const out: ParsedArgs = { emails: [], execute: false, allowMissing: false, includeOthersContent: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.indexOf('=');
    const name = arg.startsWith('--') && eq > 0 ? arg.slice(0, eq) : arg;
    const value = () => (eq > 0 ? arg.slice(eq + 1) : argv[++i]);
    if (name === '--execute') out.execute = true;
    else if (name === '--allow-missing') out.allowMissing = true;
    else if (name === '--include-others-content') out.includeOthersContent = true;
    else if (name === '--help' || name === '-h') out.help = true;
    else if (name === '--email' || name === '--emails-file' || name === '--expect-database' || name === '--confirm') {
      const v = value();
      if (v === undefined || v.startsWith('--')) return { error: `${name} needs a value.` };
      if (name === '--email') out.emails.push(v);
      else if (name === '--emails-file') out.emailsFile = v;
      else if (name === '--expect-database') out.expectDatabase = v;
      else out.confirm = v;
    } else return { error: `Unknown argument: ${name.slice(0, 40)}` };
  }
  return out;
}

const HELP = [
  'Deletes NAMED test users and everything that blocks it from a STAGING database. Dry run by default.',
  '',
  'Usage: node dist/scripts/delete-test-users.js (--email <e> [--email <e> ...] | --emails-file <path>) --expect-database=<name> [--execute --confirm=<count>]',
  '',
  '  --expect-database=<name>  required; must equal the database name in DATABASE_URL',
  '  --execute --confirm=<n>   really delete; n must equal the number of users being deleted',
  '  --allow-missing           with --execute: continue even if a listed email matches no user',
  '  --include-others-content  also delete content from OTHER users that hangs off the test users (comments, likes ...)',
  '  Refuses NODE_ENV=production, empty lists, admin-linked users, guardians of minors outside the list.',
  '  R2 objects and Redis keys are only listed, never deleted.',
].join('\n');

export function describeDatabase(databaseUrl: string): string | null {
  try {
    const url = new URL(databaseUrl);
    const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
    return url.host && database ? database : null;
  } catch {
    return null;
  }
}

export function readEmails(args: ParsedArgs, readFile: (p: string) => string): { emails: string[] } | { error: string } {
  const all = [...args.emails];
  if (args.emailsFile) {
    let text: string;
    try {
      text = readFile(args.emailsFile);
    } catch {
      return { error: 'The emails file could not be read.' };
    }
    all.push(...text.split(/\r?\n/));
  }
  const emails = [...new Set(all.map((e) => e.trim().toLowerCase()).filter((e) => e.length > 0 && !e.startsWith('#')))];
  if (emails.length === 0) return { error: 'No emails were given. Nothing was done.' };
  if (emails.length > MAX_USERS) return { error: `At most ${MAX_USERS} emails per run.` };
  const bad = emails.filter((e) => !/^[^\s@*%?]+@[^\s@*%?]+\.[^\s@*%?]+$/.test(e));
  if (bad.length > 0) return { error: `${bad.length} entr${bad.length === 1 ? 'y is' : 'ies are'} not an exact email address (wildcards and patterns are not allowed).` };
  return { emails };
}

function defaultOpenSession(databaseUrl: string): Session {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  return {
    async transaction(readOnly, work) {
      return prisma.$transaction(
        async (tx) => {
          const sql: Sql = {
            query: (q, p = []) => tx.$queryRawUnsafe(q, ...p) as Promise<never>,
            execute: (q, p = []) => tx.$executeRawUnsafe(q, ...p),
          };
          if (readOnly) await sql.execute('set transaction read only');
          return work(sql);
        },
        { timeout: 300_000, maxWait: 30_000 },
      );
    },
    close: () => prisma.$disconnect(),
  };
}

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
  if (io.env.NODE_ENV === 'production') {
    err('Refused: NODE_ENV is production. This script is for staging test data only. Nothing was done.');
    return 1;
  }
  const databaseUrl = io.env.DATABASE_URL;
  const dbName = databaseUrl ? describeDatabase(databaseUrl) : null;
  if (!databaseUrl || !dbName) {
    err('DATABASE_URL is not set or is not a valid database address. Nothing was done.');
    return 1;
  }
  if (!args.expectDatabase) {
    err('--expect-database=<name> is required. Nothing was done.');
    return 1;
  }
  if (args.expectDatabase !== dbName) {
    err(`Refused: the connected database is "${dbName}", not the expected "${args.expectDatabase}". Nothing was done.`);
    return 1;
  }
  const parsed = readEmails(args, io.readFile ?? ((p) => fs.readFileSync(p, 'utf8')));
  if ('error' in parsed) {
    err(parsed.error);
    return 1;
  }

  const session = (deps.openSession ?? defaultOpenSession)(databaseUrl);
  try {
    out(`Database: ${dbName}`);
    out(args.execute ? 'Mode: EXECUTE' : 'Mode: DRY RUN (nothing will be written)');

    const run = async (sql: Sql, execute: boolean) => {
      const fks = await loadForeignKeys(sql);
      const { found, notFound } = await loadTargets(sql, parsed.emails);
      const refusals: string[] = [];
      if (notFound.length > 0) {
        out(`Not found (${notFound.length}): ${notFound.join(', ')}`);
        if (execute && !args.allowMissing) refusals.push('A listed email matches no user. Fix the list or pass --allow-missing.');
      }
      if (found.length === 0) {
        out('No listed email matches a user. Nothing to do.');
        return { code: 1 as number, found, plan: null as Plan | null, refusals };
      }
      refusals.push(...(await checkUserSafeguards(sql, fks, found)));
      const plan = await discover(sql, fks, found, { includeOthersContent: args.includeOthersContent });
      refusals.push(...plan.refusals);
      const others = plan.findings.filter((f) => f.kind === 'others_content');
      if (others.length > 0 && !args.includeOthersContent) {
        refusals.push(`${others.reduce((a, f) => a + f.count, 0)} row(s) from other users hang off the test users' content (see below). Pass --include-others-content to delete them too.`);
      }

      for (const t of found) out(`User ${t.id}  ${t.email}  status=${t.accountStatus}  created=${t.createdAt.toISOString()}`);
      out('Rows that would be deleted:');
      for (const { table, count } of rowCounts(plan)) out(`  ${table}: ${count}`);
      for (const sn of plan.setNulls) out(`Kept, ${sn.column} set to NULL: ${sn.table}: ${sn.ctids.length}`);
      for (const f of others) out(`Other users' rows under the test users' content: ${f.table}.${f.column}: ${f.count}`);

      const keys = await objectKeysInPlan(sql, plan);
      out('To do by hand (NOT done by this script). Delete these in R2 / Redis yourself if you want them gone:');
      for (const t of found) {
        out(`  R2 prefixes for ${t.id}: ${OBJECT_PREFIXES.map((p) => `${p}/${t.id}/`).join(' ')}`);
        out(`  Redis for ${t.id}: auth:refresh:user:${t.id}  auth:revoked-at:user:${t.id}  2fa:*:user:${t.id}  guardian-security-notice:*:${t.id}`);
      }
      out('  Redis rate-limit keys (auth-limit:*) are hashed and expire on their own.');
      if (keys.length > 0) out(`  Object keys stored in rows being deleted (${keys.length}): ${keys.join(' ')}`);

      if (refusals.length > 0) {
        for (const r of refusals) err(`Refused: ${r}`);
        return { code: 1, found, plan, refusals };
      }
      return { code: 0, found, plan, refusals };
    };

    if (!args.execute) {
      return await session.transaction(true, async (sql) => (await run(sql, false)).code);
    }

    if (args.confirm === undefined) {
      err('--execute also needs --confirm=<number of users to delete>. Nothing was done.');
      return 1;
    }
    let summary: { users: number; rows: Array<{ table: string; n: number }> } | null = null;
    const code = await session.transaction(false, async (sql) => {
      const r = await run(sql, true);
      if (r.code !== 0 || !r.plan) return r.code;
      if (String(r.found.length) !== args.confirm!.trim()) {
        err(`Refused: --confirm=${args.confirm} does not equal the number of users that would be deleted (${r.found.length}). Nothing was written.`);
        return 1;
      }
      const deleted = await applyPlan(sql, r.plan);
      summary = { users: r.found.length, rows: [...deleted.entries()].map(([table, n]) => ({ table, n })) };
      return 0;
    });
    if (code === 0 && summary) {
      const s = summary as { users: number; rows: Array<{ table: string; n: number }> };
      out(`DONE ${(io.now ?? (() => new Date()))().toISOString()} database=${dbName} users=${s.users} rows=${s.rows.map((r) => `${r.table}:${r.n}`).join(',')}`);
    }
    return code;
  } catch (e) {
    if (e instanceof DeletionBlocked) {
      err(`Nothing was deleted (the transaction was rolled back). Blocked at table ${e.table}${e.constraint ? `, constraint ${e.constraint}` : ''}.`);
      return 1;
    }
    const d = describeDbError(e);
    err(`Unexpected error (${e instanceof Error ? e.name : 'unknown'}, code ${d.sqlState ?? 'none'}${d.table ? `, table ${d.table}` : ''}${d.constraint ? `, constraint ${d.constraint}` : ''}). The transaction was rolled back; nothing was written.`);
    return 1;
  } finally {
    await session.close();
  }
}

async function main(): Promise<number> {
  dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
  return runCli({
    argv: process.argv.slice(2),
    env: { ...process.env },
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  });
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((e: unknown) => {
      const code = typeof (e as { code?: unknown })?.code === 'string' ? (e as { code: string }).code : 'none';
      console.error(`Unexpected error (${e instanceof Error ? e.name : 'unknown'}, code ${code}). Nothing more was done.`);
      process.exit(1);
    });
}
