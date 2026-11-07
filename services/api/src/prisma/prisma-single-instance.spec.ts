import * as fs from 'fs';
import * as path from 'path';

// Guard for the fix described in prisma.module.ts.
//
// Nest creates one instance of a provider per module that declares it.
// PrismaService extends PrismaClient, so every module that listed it in its own
// `providers` opened its own Prisma client and its own connection pool. About 40
// modules did, which put one app boot at roughly 40 pools, and the e2e suite
// hit Postgres's max_connections (100) and then hung (2026-11-07).
//
// The rule is now: PrismaService is provided by PrismaModule ONLY. A feature
// module that needs it lists `PrismaModule` in `imports`. This test reads every
// *.module.ts under src and fails if one provides PrismaService again.
const SRC = path.resolve(__dirname, '..');

function moduleFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      out.push(...moduleFiles(full));
    } else if (entry.name.endsWith('.module.ts')) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** The text inside each `providers: [ ... ]` array of a module file. */
function providerArrays(source: string): string[] {
  const arrays: string[] = [];
  const open = /\bproviders\s*:\s*\[/g;
  while (open.exec(source) !== null) {
    let depth = 1;
    let i = open.lastIndex;
    while (i < source.length && depth > 0) {
      if (source[i] === '[') depth += 1;
      else if (source[i] === ']') depth -= 1;
      i += 1;
    }
    arrays.push(source.slice(open.lastIndex, i - 1));
  }
  return arrays;
}

describe('PrismaService is provided once, by PrismaModule', () => {
  const prismaModule = path.join(SRC, 'prisma', 'prisma.module.ts');
  const files = moduleFiles(SRC);

  it('finds the module files (the scan is not vacuous)', () => {
    expect(files.length).toBeGreaterThan(40);
    expect(files).toContain(prismaModule);
  });

  it('no feature module lists PrismaService in its own providers', () => {
    const offenders = files
      .filter((file) => file !== prismaModule)
      .filter((file) =>
        providerArrays(stripComments(fs.readFileSync(file, 'utf8'))).some((body) => /\bPrismaService\b/.test(body)),
      )
      .map((file) => path.relative(SRC, file).replace(/\\/g, '/'));
    expect(offenders).toEqual([]);
  });

  it('PrismaModule provides and exports PrismaService', () => {
    const source = stripComments(fs.readFileSync(prismaModule, 'utf8'));
    expect(providerArrays(source).join(' ')).toMatch(/\bPrismaService\b/);
    expect(source).toMatch(/exports\s*:\s*\[\s*PrismaService\s*\]/);
  });

  it('the detector catches a module that provides PrismaService (self-check)', () => {
    const bad = `@Module({ providers: [Foo, PrismaService], exports: [Foo] }) export class X {}`;
    const multiline = `@Module({\n  providers: [\n    Foo,\n    PrismaService,\n  ],\n}) export class Y {}`;
    const good = `@Module({ imports: [PrismaModule], providers: [Foo] }) export class Z {}`;
    expect(providerArrays(bad).some((b) => /\bPrismaService\b/.test(b))).toBe(true);
    expect(providerArrays(multiline).some((b) => /\bPrismaService\b/.test(b))).toBe(true);
    expect(providerArrays(good).some((b) => /\bPrismaService\b/.test(b))).toBe(false);
  });
});
