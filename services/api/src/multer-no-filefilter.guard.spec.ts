import * as fs from 'fs';
import * as path from 'path';

// Guard for the multer override (root package.json "overrides": { "multer":
// "2.5.0" }). Remove the override and keep this test when NestJS 12 is adopted.
//
// Why: @nestjs/platform-express 11.x pins multer exactly, and the pinned
// versions carry GHSA-q7qp-rjg7-q26m -- a denial of service through a PENDING
// ASYNCHRONOUS `fileFilter` after the request is torn down. The override moves
// the installed copy to 2.5.0, which fixes it, but the override is only a patch
// on a dependency we do not control. Nothing in services/api/src passes a
// `fileFilter` today (every FileInterceptor sets `limits.fileSize` only), so the
// vulnerable path is unreachable. This test fails the build if that changes, so
// the first `fileFilter` has to be a deliberate decision, not an accident.

const SRC_ROOT = __dirname;
const THIS_FILE = path.resolve(__filename);

/** Every .ts file under src, except this test. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (entry.isFile() && /\.ts$/.test(entry.name) && path.resolve(full) !== THIS_FILE) {
      out.push(full);
    }
  }
  return out;
}

/** Drop comments so prose that merely mentions the option does not trip the guard. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/** Lines of `text` that use the `fileFilter` identifier. */
function fileFilterUses(text: string): string[] {
  return stripComments(text)
    .split(/\r?\n/)
    .filter((line) => /\bfileFilter\b/.test(line))
    .map((line) => line.trim());
}

describe('multer fileFilter guard (GHSA-q7qp-rjg7-q26m)', () => {
  it('scans a non-trivial number of source files (the scan is not vacuous)', () => {
    expect(sourceFiles(SRC_ROOT).length).toBeGreaterThan(100);
  });

  it('detects fileFilter passed to FileInterceptor or multer (self-check)', () => {
    expect(
      fileFilterUses(`FileInterceptor('file', { fileFilter: async (req, file, cb) => cb(null, true) })`),
    ).toHaveLength(1);
    expect(fileFilterUses(`const upload = multer({ fileFilter })`)).toHaveLength(1);
    expect(fileFilterUses(`// fileFilter is not used here\n/* fileFilter */ const x = 1;`)).toHaveLength(0);
  });

  it('no file under services/api/src passes a fileFilter option to multer or FileInterceptor', () => {
    const offenders = sourceFiles(SRC_ROOT).flatMap((file) =>
      fileFilterUses(fs.readFileSync(file, 'utf8')).map(
        (line) => `${path.relative(SRC_ROOT, file)}: ${line}`,
      ),
    );
    expect(offenders).toEqual([]);
  });
});
