// Genuine e2e Jest config — completely separate from ../jest.config.js
// (the existing mocked-Prisma unit/HTTP-wiring suite). The two must never
// overlap:
//   - jest.config.js:      rootDir "src",  testRegex *.spec.ts
//   - jest-e2e.config.js:  rootDir "..",   testRegex test/*.e2e-spec.ts
// A file can only ever match one of these two testRegex patterns by
// naming convention (*.spec.ts vs *.e2e-spec.ts), and they additionally
// live in disjoint directories (src/ vs test/), so there is no risk of
// double-running or accidentally skipping a file. See test/README.md for
// what belongs in which suite.
/** @type {import('jest').Config} */
module.exports = {
  rootDir: '..',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Runs once, before any test file/worker — provisions and migrates the
  // real test database. See global-setup.ts.
  globalSetup: '<rootDir>/test/global-setup.ts',
  // Runs once per test-file worker, before that file's own imports
  // execute — makes sure DATABASE_URL is the test-database value before
  // AppModule (and its ConfigModule.forRoot() call) is ever imported. See
  // load-env.ts.
  setupFiles: ['<rootDir>/test/load-env.ts'],
  // Real HTTP requests, a real Postgres connection, and (for auth flows) a
  // real argon2id hash on every register/login — slower than the mocked
  // unit suite by design. 30s is generous headroom over what these specs
  // actually take locally, not a value chosen to paper over flakiness.
  testTimeout: 30000,
};
