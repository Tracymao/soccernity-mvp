# Backend: flagged-minor two-factor recovery (Decision Log #480)

Branch `backend/flagged-minor-recovery`. `services/api` only. No schema change, no migration, no `apps/*`, no Figma,
no `.docx`, no `docs/build-register.md`.

## What changed

A minor whose guardian notices are withheld (#458, `GuardianNoticeWithhold` row) now recovers two-factor like an adult.
Before, such a minor got `{ audience: "no_guardian" }` and was pointed to Contact Us.

`services/api/src/modules/two-factor/recovery/two-factor-recovery.service.ts`:

1. **`request()`**: after a correct password, `!user.isMinor || user.guardianNoticeWithhold` takes the adult path.
   `kind: "adult"`, the link goes to the account's own email, answer `{ audience: "account" }`, the same 24-hour link
   lifetime, the same 24-hour wait at confirm, the same login-limiter and recovery-budget charges. No guardian link and
   no minor notice are sent. The flag decides: it does not matter whether the guardian is confirmed, pending or absent.
   Every other minor is unchanged (guardian link, or `no_guardian`). Wrong password, unknown account, two-factor off and
   closed account are still the one generic `{ audience: "account" }`.
2. **`confirm()`**: the check that rejected any `isMinor` now rejects a minor only when the flag is no longer set at that
   moment. A cleared flag ends the request and the link reads as `expired` (the same answer as any changed account).
3. **`completeDue()`** (hourly sweep): it had no minor check at all. It now cancels a confirmed wait whose minor's flag was
   cleared during the 24 hours (counted in `cancelled`; nothing removed, no sessions ended, no completion email).

Not changed: guardian approve/decline/describe still treat a withheld account as `expired`; setting the flag still cancels
guardian-kind requests only. Adult-kind requests are not touched when the flag changes; items 2 and 3 handle them when
they are used.

## Tests

- `recovery/two-factor-recovery.service.spec.ts`: the old B-280 request cases were replaced by a 12-case block (flagged
  minor to own email and nothing to a guardian; the flag beats a confirmed / pending / absent guardian; same work and
  budget; wrong password byte-identical to the correct-password answer; unflagged minor unchanged; adult unchanged;
  confirm with flag set and cleared; sweep with flag set and cleared). The guardian-links-before-the-flag block is
  unchanged. The fake `findMany` now joins `guardianNoticeWithhold` onto the user (it joined the raw row before).
- `test/guardian-notice-withhold.e2e-spec.ts`: its recovery test asserted the old `no_guardian` answer. Rewritten to the
  adult path, plus one case that an unflagged minor with no confirmed guardian still gets `no_guardian`. **Not run.**

Run: `npx jest src/modules/two-factor/recovery --maxWorkers=2` -> 2 suites / 85 tests, 0 failures. `npx tsc --noEmit` clean.

**Not run:** the rest of the `two-factor` and `auth` unit suites, `guardian-notice-withhold` / `guardian-security-notice` /
`admin-users` specs, `test/two-factor-recovery.e2e-spec.ts`, `test/guardian-notice-withhold.e2e-spec.ts` (real Postgres),
the full mocked and e2e suites, Playwright, `apps/*`.

## Stale strings NOT edited (apps/admin; the brief forbids touching apps)

- `apps/admin/src/pages/users/guardianNoticesCopy.ts` line 22, `ALERT_BODY`: "Guardian security and safety-action notices
  for this account are skipped silently. Guardian-assisted two-factor recovery is off: the child is pointed to Contact us
  and staff help them. Consent emails are not affected." (rendered in `GuardianNoticesSection.tsx`, the ON-state alert).
- Same file, line 41, `WITHHOLD_BULLET_RECOVERY`: "Guardian-assisted two-factor recovery is switched off. The child is pointed
  to Contact us and staff help them." (rendered in the Set/Clear dialog list, `GuardianNoticesSection.tsx` line 264).
- Check `apps/admin/src/pages/users/guardianNotices.test.tsx` (if present) for assertions on these strings.
- Figma frames of `docs/figma-guardian-notice-withhold-report.md` draw the same two sentences.

`apps/web` needs no change: `TwoFactorRecoveryRequest.tsx` still handles `no_guardian`, which an unflagged minor with no
confirmed guardian still receives, and the new `{ audience: "account" }` answer already has a screen.
The true wording is that the child recovers like an adult (own email, 24-hour wait). Any rewrite is a founder call
(these strings sit beside tagged `[COPY PENDING LEGAL REVIEW]` guardian wording).

## Forward-pointer notes for the docs PR (not written here)

- Decision Log #458 and #455: dated note, recovery for a withheld minor is now the adult path (#480).
- `docs/build-register.md`: status lines on B-276, B-278, B-280 and B-282 (the admin dialog sentence above is stale).
- Legal draft Part C row 44: check whether it says a withheld child is pointed to Contact Us.
- Section 65e / 67 "what staff do to help a minor whose recovery is switched off" is answered by #480 (the adult path).

## Findings, not fixed

- A minor can now remove their own two-factor with only their own mailbox and a 24-hour wait while notices are withheld.
  That is the decision (#480), but note it removes the guardian from a safeguarding-sensitive step by design.
- The anti-enumeration property still holds: the audience is revealed only after a correct password, and a flagged minor's
  answer (`account`) is the same as a failure's.
