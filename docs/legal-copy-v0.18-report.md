# Legal copy v0.18 report (D6)

Draft only (`CLAUDE.md` non-negotiable #2). Nothing here is approved or legal advice. Base: `origin/main` `b67d9c0`. No open PR touched the file when the work started. Decision Log #533 and #534 are in docs PR R98, which was not merged when this was written. The Security session could not be asked (non-interactive).

## Changed lines (file: `docs/legal-copy-draft-tos-privacy-policy.md`, each marked `[v0.18 CHANGED ...]`)

| Where | Before | After | Source | Tagged |
|---|---|---|---|---|
| Banner, changelog | v0.17 | v0.18 changelog added above v0.17 | #479, #524 to #534 | no |
| ToS 4.3 | Google and Facebook "intended", two-factor "will use" | sign-in removed; two-factor optional with an authenticator app | #479; two-factor built | yes |
| PP 1.9 | Google/Facebook `[PROPOSAL]`; two-factor `[PROPOSAL]` | sign-in removed; two-factor built, secret encrypted, backup codes hashed (code read: `encryptString`) | #479 | yes, `[OPEN]` kept |
| PP 5 "Not yet live" | planned sign-in paragraph | removed, replaced by one sentence | #479 | no |
| PP 6 | local storage `[PROPOSAL]` | in-memory access token plus httpOnly refresh cookie; audit still open | B-246 (`session.ts` says no token in any storage) | yes |
| ToS 7.3 | "being built into the Admin Console, not yet live" | built | PR #740 | no |
| ToS 7.9 | `[PROPOSAL, not yet built]` | built marker | PRs #739, #740 | no |
| Markers #368 to #373 (11 places) | `[PROPOSAL, not yet built]` | "built; marker removed" (`[OPEN]` kept where present) | built per Decision Log | no |
| Set-aside file retention (ToS/PP, 4 prose places, PP 9 row) | "currently 365 days" | "a limited period set by Soccernity"; no figure | #534 | existing tags kept |

## Re-marked rows
18 B, 22 A, 33 D, 35 D, 41 D (all per #534); row 15 text updated; row 37's open part kept (period and wording stay with counsel). In-text marker table rows 1, 2, 5, 6, 7, 8, 9 brought to the built state. Rows 3 and 4 (B) untouched.

## Left, not verified
- Markers for #375, #376, #478, #483, #484, and the unnamed `[PROPOSAL, not yet built]` markers near lines 775, 777, 1014, 1067, 1089, 1195, 1253, 1259 were not checked.
- ToS 7.5 notices are partly built, left.
- The history lines (changelogs, row 37's v0.8 text, rows 1224/1240) still contain "365" on purpose.
- Nothing was run except a failed attempt at `LegalPage.test.tsx` (wrong path); CI cannot be read from here.

## Process note
Another session (R98) committed my working-tree edit of this file into its own commit on a branch of the same name in the shared checkout. This PR is a separate branch carrying only this file, the report and one CLAUDE.md bullet; whichever merges second may conflict on the legal copy file.
