import * as fs from 'fs';
import * as path from 'path';
import { TEST_CLOCK_ENV_VARS } from './clock/clock';

// B-018 regression guard. The build register found ~22 variables read in code
// but absent from render.yaml, so a deploy silently ran with code defaults (or
// none). This fails the build the moment code reads an environment variable
// that is not declared in render.yaml (both services) AND documented in
// .env.example.
//
// It finds variables by static pattern -- ConfigService `.get('NAME')` /
// `.getOrThrow('NAME')` and `process.env.NAME` / `process.env['NAME']` -- so a
// name built dynamically or held in a constant would not be seen. That is a
// known blind spot, not a guarantee of completeness.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC = path.resolve(__dirname);

// Not declared in render.yaml on purpose:
//  - NODE_ENV: Render sets it at runtime only; setting it as an envVar would
//    also apply at build time and make `npm install` skip devDependencies.
//  - PORT: Render injects it.
//  - TEST_CLOCK_ISO / TEST_CLOCK_ADVANCE / E2E_TEST_CLOCK: QA only; the process REFUSES TO START if any
//    is set in production (validate-runtime-env.ts), so they must never appear in render.yaml.
const NOT_IN_RENDER = new Set(['NODE_ENV', 'PORT', ...TEST_CLOCK_ENV_VARS]);
// Not in .env.example on purpose: NODE_ENV has a comment-only entry there.
const NOT_IN_EXAMPLE = new Set(['NODE_ENV']);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(full, out);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

function envVarsReadInCode(): Map<string, string> {
  const found = new Map<string, string>();
  const patterns = [
    /\.get(?:OrThrow)?(?:<[^>]*>)?\(\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g,
    /process\.env\.([A-Z][A-Z0-9_]{2,})/g,
    /process\.env\[\s*['"]([A-Z][A-Z0-9_]{2,})['"]\s*\]/g,
    // PostMediaConfig's validated-number reader: `this.num('NAME', default, min, max)`.
    /this\.num\(\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g,
  ];
  for (const file of walk(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const re of patterns) {
      for (const m of text.matchAll(re)) {
        if (!found.has(m[1])) found.set(m[1], path.relative(SRC, file));
      }
    }
  }
  return found;
}

function renderKeysPerService(): Set<string>[] {
  const text = fs.readFileSync(path.join(REPO_ROOT, 'render.yaml'), 'utf8');
  // One chunk per "- type: web" service; keys are `- key: NAME` lines.
  return text
    .split(/^\s*-\s+type:\s+web\b/m)
    .slice(1)
    .map((chunk) => new Set([...chunk.matchAll(/^\s*-\s+key:\s+([A-Z0-9_]+)/gm)].map((m) => m[1])));
}

function exampleKeys(): Set<string> {
  const text = fs.readFileSync(path.join(REPO_ROOT, '.env.example'), 'utf8');
  return new Set([...text.matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]));
}

describe('environment completeness (B-018)', () => {
  const read = envVarsReadInCode();
  const services = renderKeysPerService();
  const example = exampleKeys();

  it('finds a plausible number of variables (guards against the scanner silently matching nothing)', () => {
    expect(read.size).toBeGreaterThan(30);
    expect(services).toHaveLength(2);
    expect(read.has('JWT_SECRET')).toBe(true);
    expect(read.has('WEB_APP_BASE_URL')).toBe(true);
  });

  it('every variable the code reads is declared in render.yaml for BOTH services', () => {
    const missing: string[] = [];
    services.forEach((keys, i) => {
      for (const [name, file] of read) {
        if (!NOT_IN_RENDER.has(name) && !keys.has(name)) missing.push(`service #${i + 1}: ${name} (read in ${file})`);
      }
    });
    expect(missing).toEqual([]);
  });

  it('every variable the code reads is documented in .env.example', () => {
    const missing = [...read].filter(([name]) => !NOT_IN_EXAMPLE.has(name) && !example.has(name)).map(([n, f]) => `${n} (read in ${f})`);
    expect(missing).toEqual([]);
  });

  it('the two services declare the same set of variables (staging is not a different shape)', () => {
    const [staging, prod] = services;
    expect([...staging].filter((k) => !prod.has(k))).toEqual([]);
    expect([...prod].filter((k) => !staging.has(k))).toEqual([]);
  });

  it('declares the B-024 / B-018 additions', () => {
    for (const keys of services) {
      for (const k of ['TRUST_PROXY_HOPS', 'MAXMIND_ACCOUNT_ID', 'MAXMIND_LICENSE_KEY', 'HELD_INVESTIGATION_ALERT_DAYS', 'ADMIN_JWT_SECRET']) {
        expect(keys.has(k)).toBe(true);
      }
    }
  });
});
