import { PrismaClient } from '@prisma/client';

// Real, unmocked PrismaClient, connected to DATABASE_URL (the test
// database — see env.ts/global-setup.ts), used only for cross-cutting test
// maintenance: truncating between specs and, in clubs.e2e-spec.ts, reading
// back the real "_ClubMembership" join table directly to assert on it.
// Reused across a spec file's calls rather than opening a fresh raw
// Postgres connection before every single test.
let prisma: PrismaClient | undefined;

export function getTestPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

// Deliberately introspects the LIVE database's own pg_catalog rather than
// Prisma's DMMF (`Prisma.dmmf.datamodel.models`, or hand-listing model
// names from schema.prisma). DMMF only reflects models declared with
// `model` in schema.prisma — it does NOT include implicit many-to-many
// join tables such as "_ClubMembership" (ClubPage.members <->
// User.clubMemberships), which exist only in the real database's
// migration history, not as a modeled Prisma entity at all. This PR exists
// specifically because "_ClubMembership" had never been exercised against
// a real Postgres instance before — hand-listing tables (or trusting DMMF
// alone) would risk silently excluding the one table this PR cares about
// most from ever being reset, defeating the isolation this helper exists
// to provide. Querying pg_catalog directly captures every real table,
// model-backed or implicit, and stays correct as new models/relations are
// added later without this file needing an update.
async function getAllApplicationTableNames(client: PrismaClient): Promise<string[]> {
  const rows = await client.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;
  return rows.map((row) => row.tablename);
}

// Call in `beforeEach` (not `beforeAll`) of every e2e spec file, so each
// test starts from a genuinely empty database — full isolation between
// tests within a file, not just between files. TRUNCATE ... CASCADE
// handles foreign-key ordering automatically (no need to sort tables by
// dependency), and RESTART IDENTITY resets any serial/identity sequences
// so tests can't accidentally depend on ids left over from a previous run.
export async function resetDatabase(): Promise<void> {
  const client = getTestPrismaClient();
  const tables = await getAllApplicationTableNames(client);
  if (tables.length === 0) return;

  const quotedTableList = tables.map((table) => `"${table}"`).join(', ');
  await client.$executeRawUnsafe(`TRUNCATE TABLE ${quotedTableList} RESTART IDENTITY CASCADE;`);
}

// Call in `afterAll` of every e2e spec file alongside `app.close()`, so the
// raw Postgres connection this helper opens doesn't leak past the spec
// file's own lifetime (Jest would otherwise hang waiting for the process
// to exit, or warn about an open handle).
export async function disconnectTestPrismaClient(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = undefined;
  }
}
