// No jest config existed before this PR — the "test": "jest
// --passWithNoTests" script had nothing exercising it yet. ts-jest is
// added here (over e.g. @swc/jest) because it's the most idiomatic
// pairing with NestJS's own tooling and this project's existing
// TypeScript-strict tsconfig.
/** @type {import('jest').Config} */
module.exports = {
  rootDir: 'src',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
};
