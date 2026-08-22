// No jest config existed before this PR — the "test": "jest
// --passWithNoTests" script had nothing exercising it yet. ts-jest is
// added here (over e.g. @swc/jest) because it's the most idiomatic
// pairing with NestJS's own tooling and this project's existing
// TypeScript-strict tsconfig.
//
// testTimeout (the "global Jest timeout" PR, 2026-08-22): raised from
// Jest's implicit 5000ms default to 30000ms, replacing the
// per-test-file patch pattern PR #70 started with
// auth-rate-limit.decorator.spec.ts. PR #70 fixed two specific tests
// that bootstrap a real Nest app and make real HTTP round trips, but
// its own load-simulation methodology (spawning CPU-saturating
// background processes alongside a full `npx jest` run) found that a
// plain mocked-Prisma test with zero real HTTP calls
// (auth.service.spec.ts, which exercises real argon2id hashing via
// PasswordService) can ALSO exceed 5000ms under heavy contention — this
// isn't limited to real-HTTP tests, so a global bump is the right fix,
// not another file-by-file patch.
//
// Measured, not guessed (services/api on a 12-logical-core dev machine,
// full 34-suite run under simulated CPU load — extra CPU-saturating
// Node busy-loop processes spawned alongside `npx jest`, a local
// approximation of CI-style contention, not a real CI measurement):
//   - 8 extra busy processes (~1.6x oversubscription of 12 cores once
//     Jest's own ~11 workers are added): worst single test ~4.4-5.1s,
//     right at the old 5000ms edge (this is the level that produced an
//     actual "Exceeded timeout of 5000ms" failure at least once).
//   - 16 extra busy processes (~2.25x oversubscription), 2 runs: worst
//     single test 8724ms / 9588ms — always the same handful of
//     argon2id-hashing tests in auth.service.spec.ts.
//   - 24 extra busy processes (~2.9x oversubscription), 2 runs: worst
//     single test 12736ms / 13841ms — the figure this timeout is based
//     on, as "heavy but still plausible" contention (chosen over the
//     32-process run below, which looks like a qualitatively different,
//     less representative regime).
//   - 32 extra busy processes (~3.6x oversubscription): worst single
//     test 27440ms — recorded for completeness, but treated as an
//     outlier/extreme rather than the basis for this number: the jump
//     from the 24-process level (~13s) to this level (~27s) is much
//     larger than the jump from 16 to 24 processes was, suggesting
//     memory-pressure/GC thrashing rather than proportional CPU-sharing
//     at this level — not representative of "heavy CI contention," more
//     like a contrived worst case.
// 30000ms is ~2.2x the ~13841ms worst-case figure the choice is based
// on (comfortably over the "at least 2x" floor used to size this
// value), while staying well under the 32-process outlier above.
//
// Explicit trade-off, not a free lunch: raising this means a genuinely
// broken test (a real infinite loop or unresolved promise, not
// contention) now takes up to 30s to fail loudly instead of 5s. That's
// still the right trade here — the alternative is intermittent,
// false-negative CI failures on perfectly healthy code, which is worse
// for this project than a slower failure signal on an actually-broken
// test.
/** @type {import('jest').Config} */
module.exports = {
  rootDir: 'src',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testTimeout: 30000,
};
