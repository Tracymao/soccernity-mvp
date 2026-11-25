# R101 - staging findings batch (report)

Branch `r101-staging-findings`. Decision Log #538 to #542, register Section 106. No new B-ID. **The legal drafts were not edited and no Figma file was edited. No secret was read, pasted or printed.**

## 0. Claims-check results (item 3, the untagged strings)

Each string was untagged only after its claim was read in the code. The founder cleared the tag (Decision Log #539); the check below is what the code supports.

| String | Where | Claim | Result |
|---|---|---|---|
| "Resend verification email" | `VerifyEmailPromptPage.tsx` | a button label | label only, no claim |
| "Too many requests. Please try again in a little while." | same | the resend endpoint is rate limited | the endpoint carries per-IP and per-account limits (B-128); the line names no number |
| "We ask everyone this when they join. Your date of birth is never shown on your profile." | `AgeGateStep.tsx` | everyone is asked; DOB not shown | the Age Gate is shown to every sign-up; the public profile read returns no DOB (it exists only on the owner read and the admin correction form) |
| "Some countries ask for an extra check when a guardian approves an account for a younger child." | `AgeGateStep.tsx` | an extra check exists for some countries | true of the built card step: it applies to under-13 in the US or an unresolved country (B-024/B-025); the line names no country |
| "Set when you signed up and cannot be changed here." | `RegisterStep.tsx` only | the DOB is read-only on that step | the step shows the DOB from the Age Gate with no input |
| "Everything you upload is checked before other people can see it." | `MediaAttach.tsx` | nothing is approved by default | media is `pending` and visible only to its uploader until approved (automatic check, or a moderator) |

**Left tagged on purpose:** the same "Set when you signed up and cannot be changed here." sentence on Create Profile, Edit Profile and Account Information (different claims, not checked in this pass); the below-minimum-age Age Gate strings.

**Counts.** Manifest rows 150 to 144 (web 99 to 93, admin 51). Tagged places in the built output 206 to 200 (web 155 to 149, admin 51). The runbook said 196 before this pass; that figure was already out of date (HEAD measured 206). Counsel strings sheet S1 to S150 became S1 to S144 in `docs/counsel-review-pack.md` and the `.docx` (rebuilt with `docs/counsel-pack-build.py`). `docs/counsel-pack-check.py`: (a) to (d) PASS, 248 items = 133 A + 34 B + 20 C + 61 D + 0 not assigned, unchanged. `npm run check:pending-copy` still fails by design (allow-list empty).

## 1. What each item did

1. **Nav opacity (#538).** `Header.css` resting 0.55 to 0.7; hover, focus and active stay 1; tests updated. **For the next Figma pass:** the navbar components still draw 0.55. [2026-11-24 CORRECTION: wrong. The Figma navbar set 2824:4309 was checked: no node is drawn at 0.55 and no Figma change is needed. See Decision Log #538.]
2. **Write refusals (#542).** `FeedApiError` now carries `code`. New `writeRefusal.tsx` (`classifyWriteRefusal`, `WriteRefusalNotice`): guardian code gives the existing guardian message and the `/guardian-consent` link; `email_verification_required` gives "Verify your email to post." (comments: "to comment.") linking `/verify-email/prompt`; any other 403 gives "You can't do that right now." Used by `PostComposer` and `PostCard`. New messages are not tagged. 14 new tests (`writeRefusal.test.tsx` 11, `feed.errors.test.ts` 3) plus two updated.
3. **Untagged copy (#539).** See section 0.
4. **Runbook (#541).** (a) media custom domain always proxied; (b) 6.8 parts 1 to 3 passed on staging 2026-11-21, part 4 (cross-bucket copy) still unproven; (c) 4.6 passed; (d) Postmark pending approval delivers only to addresses on the same domain, a launch gate; (e) 6.5 note on an unverified adult.
5. **Node pin (#540).** `NODE_VERSION=22.22.0` plain value on the four static sites; `docs/deployment.md` dated note. 81 `sync: false` unchanged.

## 2. Other 403-to-guardian mappings searched

Left alone, with reasons: `community-groups/errors.ts` and `grassroots/errors.ts` (`isAwaitingConsent` tests status 403 AND the message text, not a bare 403); `AccountInformationPage`, `ClubPickerStep` (already read codes); admin 403 handlers (role or vetting specific). The contest-entry path keeps the server's message for a 403 that is neither guardian nor email verification.

## 3. Open items for a legal-draft pass (drafts NOT edited)

- The media custom domain is always proxied (images pass through Cloudflare). The privacy draft, the Cloudflare draft and the DPIA may need a line. Recorded in Decision Log #541 and register Section 106c.
- Cross-bucket copy, R2 CSP wildcards, Postmark approval remain launch-gate items.

## 4. Found, not fixed

- Section 7 of the register never got rows for #535 to #537; not backfilled.
- Older reports still say 150 / 206 / S1 to S150 (history).

## 5. Verification (measured)

- apps/web: `tsc`, eslint, `npm run build` clean; vitest 158 files / 2,050 tests, 0 failures.
- apps/admin: `tsc` clean, build clean; vitest 64 files / 1,030 tests, 0 failures.
- services/api: `tsc` clean; Jest (`--maxWorkers=4`) 338 suites passed (1 skipped), 6,660 tests passed (8 skipped), 0 failed. `render-static-sites` and `env-completeness` passed (68).
- `npm run check:pending-copy` fails by design: 200 places (web 149, admin 51), allow-list empty.
- `docs/counsel-pack-check.py`: (a) to (d) PASS, 248 = 133 A + 34 B + 20 C + 61 D + 0 X.
- Decision Log docx checked cell by cell (540 data rows, numbers unique, only table 6 changed). Register compared positionally with `origin/main` (append-only except the Section 7 heading and five rows).
- `docs/check_version_consistency.py` does not exist in the repo.
- **Not run:** Playwright (on demand only), API Jest e2e, CI (unreadable from here), any real-browser check of the 0.7 opacity or the new refusal messages.
