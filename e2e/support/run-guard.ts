import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { FAKE_MEDIA, PORTS, QA_DB_NAME } from './stack';

// Run guard (build-register B-273). A QA run is NOT safe to start twice at once:
//   - global-setup DROPS and recreates the scratch database `soccernity_qa` (and flushes a Redis logical DB),
//     under whatever run is already using it; and
//   - every run listens on the same fixed ports (API 3100, web 5273, admin 5274, fake object store 3191,
//     fake Rekognition 3192), so a second run either fails with EADDRINUSE or, worse, talks to the first
//     run's servers.
// Two sessions in two worktrees on one machine share all of that, so the guard has to be MACHINE-wide: the
// lock file lives in the OS temp directory, not in e2e/.run (which is per worktree).
//
// How it works
//   1. Take a lock file exclusively (flag 'wx'). It holds the pid of the Playwright runner that owns the run.
//   2. If the file already exists and that pid is alive, refuse with one clear line. If the pid is gone (the
//      owner crashed or was killed) the lock is stale and is taken over. A lock older than MAX_LOCK_AGE_MS is
//      also treated as stale, which covers a reused pid.
//   3. With the lock held, check that none of the run's ports is already listening (a leftover server from a
//      crashed run, or another program). If one is, release the lock and refuse.
//   4. The lock is released at teardown, when setup fails, and when the process exits. A hard kill leaves a file
//      behind; step 2 cleans that up automatically next time.
//
// The guard never kills anything and never touches the database or Redis. It runs before global-setup does
// anything else, so a refused run changes nothing.

export const LOCK_FILE = path.join(os.tmpdir(), 'soccernity-e2e-qa.lock');

// A full run takes about 40 minutes. Anything older than this is not a live run, whatever its pid says
// (DEFAULT, founder-veto-able: chosen as roughly 9x a normal run).
export const MAX_LOCK_AGE_MS = 6 * 60 * 60 * 1000;

interface LockContents {
  pid: number;
  startedAt: string;
  cwd: string;
}

export class RunGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunGuardError';
  }
}

function watchedPorts(): number[] {
  const ports = [PORTS.api, PORTS.web, PORTS.admin, Number(new URL(FAKE_MEDIA.storage).port), Number(new URL(FAKE_MEDIA.rekognition).port)];
  return ports.filter((p, i) => Number.isFinite(p) && p > 0 && ports.indexOf(p) === i);
}

function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0); // signal 0 only tests that the process exists
    return true;
  } catch (err) {
    // EPERM = exists but belongs to someone else: still alive. ESRCH = gone.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function readLock(): LockContents | null {
  try {
    const raw = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8')) as Partial<LockContents>;
    if (typeof raw.pid !== 'number') return null;
    return { pid: raw.pid, startedAt: String(raw.startedAt ?? ''), cwd: String(raw.cwd ?? '') };
  } catch {
    return null; // missing, half-written or corrupt: treated as stale
  }
}

// An unreadable lock file younger than this is a run that is still writing it, not a stale lock.
const UNREADABLE_GRACE_MS = 10_000;

function lockFileIsFresh(): boolean {
  try {
    return Date.now() - fs.statSync(LOCK_FILE).mtimeMs < UNREADABLE_GRACE_MS;
  } catch {
    return false; // gone already: the retry takes it
  }
}

function isLive(lock: LockContents | null): lock is LockContents {
  if (!lock) return false;
  if (lock.pid === process.pid) return false; // our own earlier lock (same process) is never a reason to refuse
  if (!pidAlive(lock.pid)) return false;
  const started = Date.parse(lock.startedAt);
  if (Number.isFinite(started) && Date.now() - started > MAX_LOCK_AGE_MS) return false;
  return true;
}

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const done = (inUse: boolean) => {
      socket.destroy();
      resolve(inUse);
    };
    socket.setTimeout(1500, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

export interface RunGuard {
  release(): void;
}

/** Take the machine-wide QA run lock, or throw a RunGuardError (one line) without having changed anything. */
export async function acquireRunGuard(): Promise<RunGuard> {
  const mine: LockContents = { pid: process.pid, startedAt: new Date().toISOString(), cwd: process.cwd() };
  let acquired = false;
  for (let attempt = 0; attempt < 3 && !acquired; attempt++) {
    try {
      fs.writeFileSync(LOCK_FILE, JSON.stringify(mine), { flag: 'wx' });
      acquired = true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      const existing = readLock();
      if (!existing && lockFileIsFresh()) {
        // The file exists but holds no readable contents YET: another run created it a moment ago and has not written
        // its pid. That is a run starting, not a stale lock, so do not take it over.
        throw new RunGuardError(
          `E2E run guard: another QA run is starting at this very moment (${LOCK_FILE} was just created). Nothing was changed or stopped. Wait a minute and start again.`,
        );
      }
      if (isLive(existing)) {
        throw new RunGuardError(
          `E2E run guard: another QA run is active (pid ${existing.pid}, started ${existing.startedAt || 'at an unknown time'}, from ${existing.cwd || 'an unknown folder'}). ` +
            `It owns the scratch database "${QA_DB_NAME}" and ports ${watchedPorts().join('/')}; a second run would drop that database under it. ` +
            `Wait for it to finish. If that process is not running, delete ${LOCK_FILE} and start again. Nothing was changed or stopped.`,
        );
      }
      // Stale (owner gone, file corrupt for over 10 s, or too old): remove it and try again. If two new runs race here,
      // exactly one wins the next 'wx' and the other reads a live lock on its next pass.
      try {
        fs.rmSync(LOCK_FILE, { force: true });
      } catch {
        /* the retry reports it */
      }
    }
  }
  if (!acquired) {
    throw new RunGuardError(`E2E run guard: could not take the lock file ${LOCK_FILE} (another run is starting at the same moment). Nothing was changed. Try again in a minute.`);
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const current = readLock();
    if (current && current.pid === process.pid) {
      try {
        fs.rmSync(LOCK_FILE, { force: true });
      } catch {
        /* a leftover file is cleaned up by the stale-pid rule next time */
      }
    }
  };
  process.once('exit', release);

  const busy: number[] = [];
  for (const port of watchedPorts()) if (await portInUse(port)) busy.push(port);
  if (busy.length) {
    release();
    throw new RunGuardError(
      `E2E run guard: port${busy.length > 1 ? 's' : ''} ${busy.join(', ')} ${busy.length > 1 ? 'are' : 'is'} already in use, so the QA stack cannot start. ` +
        `It is a leftover server from a crashed run or another program. Find it with "netstat -ano | findstr :${busy[0]}" (Windows) or "lsof -i :${busy[0]}" (Linux/macOS) and stop it yourself. Nothing was changed or stopped.`,
    );
  }
  return { release };
}
