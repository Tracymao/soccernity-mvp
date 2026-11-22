import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

// Generic fixture seeding for the R110 e2e spec: inserts one valid row into ANY table by reading its columns from the
// live catalog (NOT NULL columns without a default get a value of the right type; foreign keys get a freshly seeded
// parent row). Per-table overrides cover CHECK constraints and values that have a meaning.
export type Overrides = Record<string, Record<string, unknown>>;

interface Col { name: string; type: string; notNull: boolean; hasDefault: boolean }

const q = (n: string) => `"${n.replace(/"/g, '""')}"`;

export async function seedRow(
  prisma: PrismaClient,
  table: string,
  fixed: Record<string, unknown>,
  overrides: Overrides,
  userId: string,
  depth = 0,
): Promise<Record<string, unknown>> {
  if (depth > 6) throw new Error(`seed recursion too deep at ${table}`);
  const cols = await prisma.$queryRawUnsafe<Col[]>(
    `select a.attname::text as name, format_type(a.atttypid, a.atttypmod)::text as type, a.attnotnull as "notNull",
            a.atthasdef as "hasDefault"
     from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = $1 and a.attnum > 0 and not a.attisdropped order by a.attnum`,
    table,
  );
  const fks = await prisma.$queryRawUnsafe<{ col: string; parent: string; pcol: string }[]>(
    `select a.attname::text as col, pc.relname::text as parent, pa.attname::text as pcol
     from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_class pc on pc.oid = k.confrelid
     join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
     join pg_attribute pa on pa.attrelid = k.confrelid and pa.attnum = k.confkey[1]
     where k.contype = 'f' and c.relname = $1`,
    table,
  );
  const values: Record<string, unknown> = {};
  const ov = overrides[table] ?? {};
  for (const col of cols) {
    if (col.name in fixed) { values[col.name] = fixed[col.name]; continue; }
    if (col.name in ov) { values[col.name] = ov[col.name]; continue; }
    if (!col.notNull || col.hasDefault) continue;
    const fk = fks.find((f) => f.col === col.name);
    if (fk) {
      if (fk.parent === 'User') { values[col.name] = userId; continue; }
      const parent = await seedRow(prisma, fk.parent, {}, overrides, userId, depth + 1);
      values[col.name] = parent[fk.pcol];
      continue;
    }
    values[col.name] = defaultFor(col);
  }
  const names = Object.keys(values);
  const casts = names.map((n, i) => `$${i + 1}::${cols.find((x) => x.name === n)!.type}`);
  const params = names.map((n) => {
    const v = values[n];
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  });
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `insert into ${q(table)} (${names.map(q).join(', ')}) values (${casts.join(', ')}) returning *`,
    ...params,
  );
  return rows[0];
}

function defaultFor(col: Col): unknown {
  const t = col.type;
  if (t === 'uuid') return randomUUID();
  if (t.startsWith('timestamp')) return new Date();
  if (t === 'boolean') return false;
  if (t === 'integer' || t === 'bigint' || t === 'smallint') return 0;
  if (t.startsWith('double') || t === 'real' || t.startsWith('numeric')) return 0;
  if (t === 'jsonb' || t === 'json') return {};
  if (t.endsWith('[]')) return '{}';
  return `x-${randomUUID().slice(0, 8)}`;
}
