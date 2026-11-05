// B-116 (Decision Log #468). Unit-suite-only stand-in for the `argon2` package
// (wired in through jest.config.js `moduleNameMapper`; test/jest-e2e.config.js
// does NOT use it, so the e2e layer keeps the library's real default cost).
//
// Why: argon2.hash()'s defaults (argon2id, 64 MiB, 3 passes, 4 lanes) cost
// ~100 ms alone but, with several Jest workers hashing at once, 4 lanes each
// oversubscribe the CPU and 64 MiB each pressure RAM -- measured on the 12-core
// dev machine: ~100 ms per hash alone, ~440 ms per hash with 6 processes
// hashing concurrently. Specs that hash dozens of passwords
// (password-reset.service.spec.ts took 141 s on a loaded machine) then starve
// every other worker until real-HTTP specs miss the 30 s test timeout. The
// unit tests only need a *valid* argon2id hash that verify() accepts, not a
// production-strength one.
//
// What it changes: hash() calls without explicit options get 1 MiB / 2 passes
// / 1 lane (~4 ms). Explicit options still win. verify() is untouched and
// reads the parameters from the hash string, so hashes made with the real
// defaults (such as the decoy hash in password-reset.service.ts) still verify.
// Nothing under src/ is changed; production hashing is unaffected.
const path = require('path');

// An absolute directory path is not matched by the `^argon2$` mapping, so this
// loads the real package rather than this file again.
const real = require(path.dirname(require.resolve('argon2/package.json')));

const TEST_COST = { memoryCost: 1024, timeCost: 2, parallelism: 1 };

module.exports = {
  ...real,
  hash: (plain, options) => real.hash(plain, { ...TEST_COST, ...options }),
};
