import { test, expect } from '@playwright/test';
import { uniqueUsername } from '../support/username';
// The REAL username rules the API enforces (no copy, no mock). Pure functions,
// no database, so a spec can import them directly.
import { checkUsernameRules } from '../../services/api/src/modules/users/username-rules.util';

// R107: proves the spec helper can never produce a name the API refuses.
// Every label the specs pass to uniqueUsername / assignUsername, plus the three
// the baseline report measured as unlucky with the old generator.
const LABELS = [
  'Case', 'adab', 'adult', 'c1', 'c2', 'c3', 'clb', 'cpdone', 'done', 'ep', 'held', 'img9',
  'ko', 'lo', 'mdone', 'new', 'ok', 'own', 'pub', 'refr', 'rel', 'rest', 'shot', 'tf', 'uirv',
  'blk9', 'blk10', 'b117-creator', 'creator', 'member', 'viewer', 'owner', 'x', '',
];

const OWNERS = [
  {},
  { displayName: 'Adult User', email: 'adult-1760000000000@example.com' },
  { displayName: 'Nelson Iheagwam', email: 'nelson.iheagwam@example.com' },
  { displayName: 'QA Account', email: 'qa+held@example.com', dateOfBirth: new Date('1990-05-17') },
];

const TOTAL = 120_000;

test.setTimeout(120_000);
test('uniqueUsername never produces a name checkUsernameRules refuses', () => {
  const seen = new Set<string>();
  const rejected: string[] = [];
  let n = 0;
  while (n < TOTAL) {
    for (const label of LABELS) {
      const name = uniqueUsername(label);
      n += 1;
      if (name.length < 3 || name.length > 30) rejected.push(`length ${name}`);
      if (!/^[A-Za-z]+$/.test(name)) rejected.push(`format ${name}`);
      if (seen.has(name)) rejected.push(`duplicate ${name}`);
      seen.add(name);
      const owner = OWNERS[n % OWNERS.length];
      const failure = checkUsernameRules(name, owner);
      if (failure) rejected.push(`${name} -> ${failure}`);
    }
  }
  expect(n).toBeGreaterThanOrEqual(100_000);
  expect(rejected.slice(0, 20)).toEqual([]);
  expect(seen.size).toBe(n);
});
