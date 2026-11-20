# age-reclassification

`sprint-1/age-reclassification-sweep` — Decision Log #349 (closes the gap #346/#347 disclosed).

`User.isMinor` / `User.isUnder16` were derived once at registration and never
recomputed. `AgeReclassificationSweepService` (`@Cron(EVERY_DAY_AT_2AM)`)
recomputes both from `dateOfBirth` with the same `age.util` functions
registration uses, for every account whose stored value no longer matches, in
both directions. Accounts with no `dateOfBirth` (anonymized `deleted` rows) are
never touched.

## Transition behaviour

- **Immediate, not next login.** The access token carries only `{ sub, role }`;
  `GuardianConsentGuard`, `Under16RestrictionGuard`, and the messaging
  adult→minor / recipient checks all read the flags fresh from Postgres per
  request. The next request on a still-live session sees the new classification.
- **Turning 16:** nothing to reverse; the restriction simply stops applying.
- **Turning 18:** the `Guardian` row is not deleted or given a new terminal
  status. A `confirmed` row is consent history and is no longer read. A
  `pending` row is inert: the consent-expiry sweep and every refusal path
  (decline / withdraw / expiry) skip non-minors, so an adult can't be
  auto-declined into deletion by a request made when they were a child.
  `anonymizeUser` now snapshots any Guardian row regardless of `isMinor`.

## Audit

One append-only `AgeReclassificationLog` row per field changed (`field`,
`fromValue`, `toValue`, `ageAtChange`, `occurredAt`), written in the same
transaction as the `User` update. `userId` is a plain string (no FK) so the
record survives anonymization; no date of birth is stored.

## Not built / open

Daily cadence means up to ~24h of misclassification after a birthday; no
user/guardian notification on reclassification; no frontend change.
