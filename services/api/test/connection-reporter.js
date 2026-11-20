// Jest reporter (diagnostic, opt-in): prints how many Postgres connections to
// the test database are open right after EACH e2e spec file finishes.
//
// Why it exists: on 2026-11-07 two CI runs failed with "FATAL: sorry, too many
// clients already" (Postgres default max_connections=100) and then hung, because
// Jest could not exit. Running in band, every spec file gets its own module
// registry, so any Prisma client / Nest app a file does not close stays open for
// the rest of the run. This reporter makes that visible per file: a healthy run
// shows a flat number; a leak shows a staircase.
//
// Enabled only when E2E_LOG_CONNECTIONS=1 (see jest-e2e.config.js). It runs in
// the Jest parent process, uses ONE connection of its own (connection_limit=1,
// subtracted from the count), and never throws: a failure to count must not
// fail the suite.
const { PrismaClient } = require('@prisma/client');

function limitedUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  return url + (url.includes('?') ? '&' : '?') + 'connection_limit=1';
}

class ConnectionReporter {
  constructor() {
    this.prisma = undefined;
  }

  client() {
    if (!this.prisma) {
      const url = limitedUrl();
      this.prisma = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
    }
    return this.prisma;
  }

  async onTestResult(_test, result) {
    try {
      // Give Postgres a moment to reap backends of clients the file just closed.
      await new Promise((resolve) => setTimeout(resolve, 500));
      const rows = await this.client().$queryRaw`
        SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database()
      `;
      const open = Math.max(0, Number(rows[0].n) - 1); // minus this reporter's own connection
      const file = String(result.testFilePath).split(/[\\/]/).pop();
      console.log(`[e2e-connections] ${String(open).padStart(3)} open after ${file}`);
    } catch (err) {
      console.log(`[e2e-connections] could not count (${err && err.name ? err.name : 'error'})`);
    }
  }

  async onRunComplete() {
    try {
      if (this.prisma) await this.prisma.$disconnect();
    } catch (_err) {
      // ignore
    }
  }
}

module.exports = ConnectionReporter;
