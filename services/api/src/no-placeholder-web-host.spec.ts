import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

// B-115 (Decision Log #468). A made-up web host must never come back as a
// fallback for WEB_APP_BASE_URL: an email whose only call to action is a link
// to a host that does not exist is worse than no email. The rule is "unusable
// base URL = send nothing" (buildWebAppLink), enforced by search so a new
// fallback fails the build. Spec files are skipped on purpose: they use the
// placeholder host as the example of a value that must be REFUSED.
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

describe('no placeholder web host in service source (B-115)', () => {
  const files = sourceFiles(__dirname);

  it('scans a plausible number of source files (the search itself is not vacuous)', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('has no "app.soccernity.example" anywhere in non-spec source', () => {
    const hits = files.filter((f) => readFileSync(f, 'utf8').includes('app.soccernity.example'));
    expect(hits).toEqual([]);
  });

  it('never falls back to a literal URL when reading WEB_APP_BASE_URL', () => {
    const hits = files.filter((f) =>
      /WEB_APP_BASE_URL['"]\)\s*(\?\?|\|\|)\s*['"`]/.test(readFileSync(f, 'utf8')),
    );
    expect(hits).toEqual([]);
  });
});
