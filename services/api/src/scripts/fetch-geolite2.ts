import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DEFAULT_GEOLITE2_DB_PATH } from '../geoip/geoip.service';

// B-024: downloads MaxMind's GeoLite2-Country database to the path GeoIpService
// reads, so the country can be derived from an IP locally (no third party ever
// sees the IP). Run from Render's buildCommand (and by hand to refresh):
//
//   node services/api/dist/scripts/fetch-geolite2.js
//
// REQUIRES (set by a human, never printed or committed):
//   MAXMIND_ACCOUNT_ID   MaxMind account id
//   MAXMIND_LICENSE_KEY  MaxMind licence key
// Creating that account and accepting the GeoLite2 licence terms is a founder
// action (docs/deployment.md). The database file itself is gitignored: MaxMind's
// terms do not allow redistributing it, so it is fetched per build, not stored
// in the repository.
//
// FAIL-SAFE BY DESIGN -- this script NEVER fails the build or the deploy:
//   - missing credentials  -> logs "skipped" and exits 0
//   - download/extract/verify failure -> logs the reason and exits 0
// Either way no (new) database lands on disk and GeoIpService reports every
// lookup as "unresolved", which applies the STRONGER safeguarding control
// (card verification for every under-13). It is stricter, never looser. An
// existing database is only replaced by one that has been verified to open and
// answer a lookup, via an atomic rename.
//
// URL, auth scheme (HTTP Basic: account id + licence key) and the tar.gz layout
// follow MaxMind's documented direct-download permalink. NOT verified against
// MaxMind (no account exists in this repository's environment): confirm with the
// first real run.
const DOWNLOAD_URL = 'https://download.maxmind.com/geoip/databases/GeoLite2-Country/download?suffix=tar.gz';
const MIN_PLAUSIBLE_BYTES = 1_000_000; // the real file is several MB

export interface FetchGeoLite2Deps {
  fetchFn: typeof fetch;
  // Extracts the archive and returns the path of the .mmdb inside it.
  extract: (archivePath: string, outDir: string) => string;
  // Throws unless the file opens and can answer a lookup.
  verify: (mmdbPath: string) => Promise<void>;
  log: (message: string) => void;
}

export type FetchGeoLite2Outcome =
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string }
  | { status: 'installed'; path: string };

export async function fetchGeoLite2(
  env: Record<string, string | undefined>,
  deps: FetchGeoLite2Deps,
): Promise<FetchGeoLite2Outcome> {
  const accountId = env.MAXMIND_ACCOUNT_ID?.trim();
  const licenseKey = env.MAXMIND_LICENSE_KEY?.trim();
  if (!accountId || !licenseKey || /^replace-me/i.test(accountId) || /^replace-me/i.test(licenseKey)) {
    const reason = 'MAXMIND_ACCOUNT_ID / MAXMIND_LICENSE_KEY not set';
    deps.log(`[geolite2] skipped: ${reason}. Country lookups will be "unresolved" (stronger control applies).`);
    return { status: 'skipped', reason };
  }

  const destination = env.GEOLITE2_DB_PATH?.trim() ? path.resolve(env.GEOLITE2_DB_PATH.trim()) : DEFAULT_GEOLITE2_DB_PATH;
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'geolite2-'));
  try {
    // MaxMind redirects to a pre-signed storage URL; fetch drops the
    // Authorization header on the cross-origin hop, which is what we want.
    const response = await deps.fetchFn(DOWNLOAD_URL, {
      headers: { Authorization: `Basic ${Buffer.from(`${accountId}:${licenseKey}`).toString('base64')}` },
      redirect: 'follow',
    });
    if (!response.ok) {
      return fail(deps, `download returned HTTP ${response.status}`);
    }

    const archivePath = path.join(workDir, 'GeoLite2-Country.tar.gz');
    fs.writeFileSync(archivePath, Buffer.from(await response.arrayBuffer()));

    const extracted = deps.extract(archivePath, workDir);
    if (fs.statSync(extracted).size < MIN_PLAUSIBLE_BYTES) {
      return fail(deps, 'downloaded database is implausibly small');
    }
    await deps.verify(extracted);

    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const staging = `${destination}.tmp`;
    fs.copyFileSync(extracted, staging);
    fs.renameSync(staging, destination); // atomic: readers see the old file or the new one
    deps.log(`[geolite2] installed GeoLite2-Country database at ${destination}`);
    return { status: 'installed', path: destination };
  } catch (err) {
    // Error messages here come from fetch/fs/tar/maxmind and never include the
    // Authorization header; the credentials are not interpolated anywhere.
    return fail(deps, (err as Error).message);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

function fail(deps: FetchGeoLite2Deps, reason: string): FetchGeoLite2Outcome {
  deps.log(`[geolite2] FAILED (build continues; lookups will be "unresolved"): ${reason}`);
  return { status: 'failed', reason };
}

// --- real dependencies (only used when run as a script) ---

function extractWithTar(archivePath: string, outDir: string): string {
  execFileSync('tar', ['-xzf', archivePath, '-C', outDir], { stdio: 'ignore' });
  const found = findFile(outDir, (name) => name.endsWith('.mmdb'));
  if (!found) throw new Error('no .mmdb file found in the downloaded archive');
  return found;
}

function findFile(dir: string, match: (name: string) => boolean): string | null {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findFile(full, match);
      if (nested) return nested;
    } else if (match(entry.name)) {
      return full;
    }
  }
  return null;
}

async function verifyDatabase(mmdbPath: string): Promise<void> {
  // Lazy import so unit tests that inject their own verify never load maxmind.
  const { open } = await import('maxmind');
  const reader = await open(mmdbPath);
  reader.get('8.8.8.8'); // throws on a corrupt/incompatible file
}

if (require.main === module) {
  fetchGeoLite2(process.env, {
    fetchFn: fetch,
    extract: extractWithTar,
    verify: verifyDatabase,
    log: (m) => console.log(m),
  })
    // Exit 0 on every outcome by design -- see the header.
    .then(() => process.exit(0))
    .catch((err) => {
      console.log(`[geolite2] FAILED (build continues): ${(err as Error).message}`);
      process.exit(0);
    });
}
