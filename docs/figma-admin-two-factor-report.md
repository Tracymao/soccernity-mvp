# Figma: Admin Console two-factor screens (B-271)

Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only: no application code, schema, legal text, DPIA, Build Plan docx or `docs/build-register.md` was changed. Written for the frontend agent that codes these screens in `apps/admin` next.

Source of truth for behaviour: the merged admin two-factor backend (PR #564, follow-ups PR #565), `services/api/src/modules/admin/admin-two-factor.controller.ts`, `admin-auth.controller.ts`, `admin-staff-roles` and `docs/admin-two-factor-recovery.md`. Register rows read first: B-271, B-087, B-111, B-015; `docs/figma-pass-h-report.md` for the user-side states.

## 1. What was built

30 frames (all 1440 x 1184, desktop, light mode), 6 annotation Notes, 2 section texts, in one clear band below the existing canvas (y 121,350 to 131,184, x 0 to 12,920). Nothing existing was edited, archived or deleted.

- **Pre-session (sign-in side), 20 frames**: centred card on `brand/off-white`, brand row, content. Built from the F2 components (Button, Pill, Field, Banner) and local auto-layout frames bound to the `Soccernity Spacing & Radius` variables.
- **In-session, 10 frames**: `Admin Shell` component set `6014:12948` instances (`Active=None` for profile, `Active=Settings` for staff), content at x 300 / y 45 with the 117px spacer that clears the shell top bar (same structure as the pass K frames).

### Brief deviation: there was no admin sign-in frame

The brief said "match the existing admin sign-in frame". **No admin sign-in frame exists in Figma.** `apps/admin` `AdminLoginPage.tsx` says so in its own header (Decision Log #231(a)); the only sign-in frames are the user-side Login frames (`407:844` / `1625:2303`, pass H prompts under the user logo bar). I therefore drew the plain sign-in from the code (brand, "Admin Console", "Sign in with your staff account.", Email, Password, Sign in) and built every pre-session screen on the same card. This is flagged as a Decision Log candidate on the canvas (founder to confirm it becomes the canonical admin sign-in).

### Reuse

- User-side wording kept where the same: "Open your authenticator app and scan this code to add Soccernity." (adapted), "If you can't scan the QR code, type this key into your authenticator app instead.", "These 10 codes are shown once. Each code can be used one time if you cannot use your authenticator app.", Copy key / Copy codes buttons (the only copy actions; no print or download because none exists on the user-side frames).
- Logo clone from the Top Bar (`6711:27532`).
- The user-side code boxes, QR block and backup-code list are local frames in the Montserrat Community style; they were rebuilt in the Admin (Inter) style with identical structure (6 boxes 52 x 60, 200 x 200 QR block, 10 codes in two columns) rather than cloned, so the admin screens use the Admin text styles.

## 2. Node ids

### Pre-session: sign-in

| Frame | Node id |
| --- | --- |
| Admin sign-in (plain base) | `6896:32445` |
| Admin sign-in with the "two-factor is now required" notice | `6896:32472` |

### Pre-session: enrolment required (login answer `twoFactorEnrolmentRequired`)

| State | Node id |
| --- | --- |
| 1a Step 1, scan the QR code, loading the setup code | `6899:32468` |
| 1b Step 1, scan the QR code | `6899:32495` |
| 1c Step 1, enter the setup key (manual) | `6899:32522` |
| 2a Step 2, enter the first code | `6899:32549` |
| 2b Step 2, checking the code (loading) | `6899:32579` |
| 2c Step 2, wrong code | `6899:32615` |
| 2d Step 2, locked after 5 wrong codes | `6899:32651` |
| 3 Setup expired (with Back to sign in) | `6899:32687` |

### Pre-session: backup codes shown once

| State | Node id |
| --- | --- |
| 1 Not yet confirmed (Continue disabled) | `6899:32707` |
| 2 Confirmed (checkbox ticked, Continue enabled) | `6899:32759` |

### Pre-session: code prompt (login answer `twoFactorRequired`)

| State | Node id |
| --- | --- |
| 1a Authenticator code | `6900:32510` |
| 1b Checking the code (loading) | `6900:32541` |
| 1c Wrong code | `6900:32578` |
| 1d Locked after 5 wrong codes | `6900:32615` |
| 1e Sign-in step expired | `6900:32650` |
| 2a Backup code ("Use a backup code instead") | `6900:32670` |
| 2b Checking the backup code (loading) | `6900:32699` |
| 2c Backup code not accepted | `6900:32728` |

### In-session: profile two-factor card

| State | Node id |
| --- | --- |
| 1 On, required, backup codes remaining (no Turn off) | `6902:32565` |
| 2 Status could not be loaded | `6902:32691` |
| 3 Regenerate backup codes, password dialog | `6902:32811` |
| 4 Regenerate, incorrect password | `6902:32956` |
| 5 New backup codes shown once | `6902:33104` |

### In-session: staff, reset two-factor

| State | Node id |
| --- | --- |
| 1 Edit admin (another admin) | `6902:33251` |
| 2 Confirm reset dialog (F2 `Dialog` Tone=Alert instance) | `6902:33382` |
| 3 Nothing to reset, two-factor not on (409) | `6902:33532` |
| 4 Reset done | `6902:33682` |
| 5 Own account, reset not available | `6902:33820` |

### Notes and section texts

Section title `6903:33669`, description `6903:33670`; Notes (F2 `Note` instances): sign-in `6903:33671`, enrolment `6903:33674`, backup codes `6903:33677`, code prompt `6903:33680`, profile card `6903:33683`, staff reset `6903:33686`.

## 3. Frame to API / code mapping

| Frame(s) | Driven by | Notes for the build |
| --- | --- | --- |
| Sign-in base | `POST /admin/auth/login` | Unchanged from today's `AdminLoginPage`. |
| Enrolment 1a to 1c | Login answer `{ twoFactorEnrolmentRequired: true, enrolmentToken, expiresInSeconds }` (no session, no cookie). Then `POST /admin/auth/login/two-factor/enrol/start { enrolmentToken }` returns `{ secret, otpauthUri }`. | 1a = waiting for `enrol/start`. 1b draws a QR from `otpauthUri`; 1c shows `secret` (display in groups of 4, copy button). The enrolment token is the only credential; keep it in memory. |
| Enrolment 2a, 2b | `POST /admin/auth/login/two-factor/enrol/confirm { enrolmentToken, code }` | 200 returns the session **and** `backupCodes` (10, once). Per-IP limit 10 per 15 min (`ADMIN_CODE_IP_LIMIT`). |
| Enrolment 2c Wrong code | `401` message `That code did not work. Check it and try again.` | The message is the same for a wrong code and an already-used one by design. |
| Enrolment 2d Locked | `429` body code `two_factor_code_locked`, message `Too many attempts. Try again later.`, `Retry-After` header | 5 wrong codes in 15 minutes lock code entry for that account for 15 minutes. The frame shows static wording; read `Retry-After` if a countdown is wanted (not drawn). The per-IP limit also answers 429, without that code (see section 5). |
| Enrolment 3 Setup expired | `401` message `This sign-in step has expired. Sign in again.` from `enrol/start` or `enrol/confirm` | Enrolment token lives 10 minutes (`ENROLMENT_TTL_SECONDS`, configuration default). Show this state on any 401 here; the only way out is Back to sign in. |
| Backup codes 1, 2 | `backupCodes` from the `enrol/confirm` 200 | **The confirm response already carries the session.** Hold it in memory and do not enter the Console until the checkbox is ticked. Continue stays disabled until then. Codes: 10 characters, 5-5, letters and digits without 0 O 1 I (#405 item 8); the hyphen is display only (the server also accepts a space). The values in the frames are samples. |
| Code prompt 1a to 1e | Login answer `{ twoFactorRequired: true, challengeToken, challengeExpiresInSeconds }`, then `POST /admin/auth/login/two-factor { challengeToken, code }` | One endpoint, `code` is a 6-digit code or a backup code. Challenge lives 5 minutes (`LOGIN_CHALLENGE_TTL_SECONDS`). 1c, 1d, 1e use the same messages and codes as the enrolment 2c, 2d, 3. |
| Code prompt 2a to 2c | Same endpoint, backup code in `code` | A wrong, replayed or already-spent backup code gets the same 401 message. Locked and expired are identical in both modes (in backup mode the single field would be disabled under the same banner; not drawn twice). |
| Sign-in with notice | `POST /admin/auth/refresh` answering `401` with body `code: "admin_two_factor_enrolment_required"` (ADMIN_2FA_ENFORCED on, admin has no two-factor; the server also ends every session of that admin) | Today `apps/admin` reads any refresh 401 as "signed out" and never looks at the body code, so the frontend must read `code` and show the notice on `/login`. The notice does not replace the form; the next sign-in answers `twoFactorEnrolmentRequired`. |
| Profile card 1 | `GET /admin/auth/two-factor/status` returns `{ enabled, backupCodesRemaining }` | Turn off is not drawn: while `ADMIN_2FA_ENFORCED` is `true`, `POST /admin/auth/two-factor/disable` answers `403 admin_two_factor_required` ("Two-factor authentication is required for admin accounts and cannot be turned off."). See section 4 for the enforcement-off case and section 5 for how the frontend learns enforcement is on. |
| Profile card 2 | Failure of the status request | Banner Error with "Try again". |
| Profile card 3, 4 | `POST /admin/auth/two-factor/backup-codes/regenerate { password }` | Wrong password = `401` message `Incorrect password`. The current codes stop working once it succeeds (the codes are replaced). |
| Profile card 5 | `{ backupCodes }` from the regenerate 200 | Same "shown once" rule as the enrolment backup codes. Done stays disabled until the box is ticked. |
| Staff 1 | `POST /admin/staff/:id/two-factor/reset`, superadmin only | The staff list returns no two-factor status, so the card (and Reset) is always shown. |
| Staff 2 | Same route, 200 returns `{ id, twoFactorEnabled: false }` | Ends every session of the target, writes audit action `admin_user.two_factor_reset`, sends no email (adopted default). With enforcement on, the target must enrol again at their next sign-in. |
| Staff 3 | `409` code `two_factor_not_enabled`, message `This admin does not have two-factor authentication turned on.` | The reset is refused rather than silently succeeding. |
| Staff 4 | After the 200 | The dialog closes; an Info banner confirms. |
| Staff 5 | `403` code `cannot_reset_own_two_factor`, message `You cannot reset your own two-factor authentication. Another superadmin must do it.` | Reset drawn disabled for the caller's own record. The extra sentence points the last superadmin at the documented database recovery (`docs/admin-two-factor-recovery.md`), without naming the file in the UI. |

## 4. When enforcement is off

`ADMIN_2FA_ENFORCED` is off by default until these screens exist and must be `true` at launch (B-267 (j)). When it is **off**, an admin may turn their own two-factor off from the profile card with their password (`POST /admin/auth/two-factor/disable`, 204). That state, and the "Turn off" dialog it would need, are **not drawn** because the brief asked for the enforced state only. The user-side turn-off frames (`6711:27333`, `6712:27465`) are the pattern to reuse if that is wanted.

## 5. Wording tagged for counsel

All new wording about authentication and recovery carries the `Copy Tag` chip `[COPY PENDING LEGAL REVIEW]` at frame level (the pass H convention) on every frame except the plain sign-in base, whose wording already exists in `AdminLoginPage`. The tag covers every string below.

- Sign-in notice: "Two-factor authentication is now required" / "Your session ended because two-factor authentication is now required for admin accounts. Sign in again to set it up."
- Enrolment: "Step 1 of 2", "Step 2 of 2", "Set up two-factor authentication", "Two-factor authentication is required for admin accounts, so you can’t skip this step. Open your authenticator app and scan this code to add Soccernity.", "Preparing your setup code…", "Can’t scan? Enter a setup key instead", "Enter the setup key", "If you can’t scan the QR code, type this key into your authenticator app instead.", "Back to the QR code", "Enter the 6-digit code", "Enter the code your authenticator app shows for Soccernity.", "Confirm", "Checking…", "Back", "Back to sign in", "Too many wrong codes", "Code entry is locked for 15 minutes. Try again later.", "Setup expired", "This sign-in step has expired. Sign in again to start over."
- Wrong-code wording is the API message `That code did not work. Check it and try again.` verbatim.
- Backup codes: "Save your backup codes", "These 10 codes are shown once. Each code can be used one time if you cannot use your authenticator app. Store them somewhere safe.", "Copy codes", "I have saved these codes", "Continue to the Admin Console".
- Code prompt: "Enter your authentication code", "Enter the 6-digit code from your authenticator app to finish signing in.", "Use a backup code instead", "Sign-in expired", "This sign-in step has expired. Sign in again.", "Enter a backup code", "Enter one of your 10-character backup codes. Each code works once.", "Backup code", "Use an authenticator code instead".
- Profile card: "Two-factor authentication", "On", "Signing in needs a code from your authenticator app as well as your password.", "Backup codes remaining", "Two-factor authentication is required for admin accounts, so it can’t be turned off.", "Regenerate backup codes", "We couldn’t load your two-factor status. Check the connection and try again.", "Enter your password to create 10 new backup codes. Your current codes stop working.", "Regenerate", "Your new backup codes", "These 10 codes are shown once. Each code can be used one time if you cannot use your authenticator app. Your old codes no longer work.", "Done".
- Staff: "Resetting removes this admin’s authenticator app and backup codes, and signs them out of every session. If two-factor is required for admin accounts, they must set it up again the next time they sign in. Resetting is recorded in the audit log.", "Reset two-factor", "Reset two-factor for Amara Okafor?", "This removes their authenticator app and all backup codes, and signs them out of every session.", "This can’t be undone", "They will need to set up two-factor again. No email is sent to them.", "There is nothing to reset for this admin.", "Two-factor reset", "Amara Okafor was signed out of every session. If two-factor is required for admin accounts, they must set it up again at their next sign-in.", "You cannot reset your own two-factor authentication. Another superadmin must do it. If you are the only superadmin and cannot sign in with your authenticator app or a backup code, the person who owns the database must follow the documented recovery steps."

Numbers that appear in wording and are decided, not counsel-sourced: the 15-minute lock (5 wrong codes in 15 minutes lock for 15, #404 item 7). The 10-minute enrolment and 5-minute challenge lifetimes are veto-able configuration defaults and are deliberately **not** printed in the UI.

The frontend agent should add `docs/pending-copy-manifest.md` rows for these when coding.

## 6. What could not be drawn, or is undecided

Open points are also on the canvas as `SCOPE OPEN` / `DECISION CANDIDATE` Notes.

1. **No admin sign-in frame existed**, so the base sign-in is new (see section 1). Founder to confirm.
2. **The status endpoint does not say whether enforcement is on.** `GET /admin/auth/two-factor/status` returns only `enabled` and `backupCodesRemaining`. The profile card draws no Turn off at all, which is right for launch; if Turn off must appear while enforcement is off, the backend needs to add an `enforced` flag (or the frontend must try `disable` and read the 403). Not decided.
3. **Not drawn:** the enforcement-off Turn off flow (section 4); a "Not turned on" card with a Turn on button (an admin enrolled at sign-in always has two-factor while enforcement is on); a low-backup-codes warning (no threshold is decided); a countdown for the lock (the `Retry-After` header is available); the per-IP 429 (10 per 15 minutes on the code and enrolment endpoints), which answers 429 without a `two_factor_code_locked` code and would need its own wording.
4. **Locked in backup-code mode** is not drawn separately (same banner, field disabled).
5. **Staff list:** the list gives no two-factor status, so there is no column or badge; Reset is always offered and a 409 explains "nothing to reset". Adding a status to the list response would let the screen hide Reset when there is nothing to reset.
6. **The profile card is a card only.** It is added to the Admin Profile page (`5403:7327`) below the profile fields; those fields are not repeated and the existing frame was not edited.
7. **The staff frames are a new Edit admin layout.** The Edit Role page in code (`EditRolePage`) has Role, Child safety vetting and Account status cards that have no Figma frame; the frames here draw only an identity card plus the two-factor card. Where the card sits relative to those cards is for the build.
8. **Sample data:** the names (Amara Okafor, the signed-in admin) and emails are sample text, not real people; the setup key and the 10 backup codes are samples and are named as such in their layer names.

## 7. Self-checks

Measured by a node walk over every new top-level node (`findAll`-style traversal, visible solid paints), with the standing count and id-hash check from Decision Log #404 item 14:

- Top-level nodes on page `0:1`: **1,044 to 1,082** (30 frames, 6 Notes, 2 section texts). Hash of the original 1,044 ids unchanged (`603324966`, same before and after); no node deleted, archived or edited.
- Paints: 1,569 solid paints bound to variables; **0 unbound on authored nodes**. 30 unbound solids are inherited, not authored: 20 are the cloned logo vectors in the brand row (brand artwork, same as the Top Bar), 10 are `Rectangle 223` inside the `Admin Shell` instances (the shell's literal sidebar wash, Decision Log #199). 10 image fills are the shell avatar. No gradient or other paint types.
- Overlaps: 0 against every other top-level node on the page.
- Frame size: all 30 are 1440 x 1184 (the admin floor).
- Node names: 0 default names ("Frame 12", "Rectangle 4") on authored nodes.
- Contrast (computed from the token values; WCAG 2.1): primary navy on white 12.6:1; secondary text (navy 70%) on white 5.0:1, on off-white 4.8:1, on the green tint 4.8:1; white on navy 12.6:1; navy on the tint 11.4:1. The alert colour is used only as a bar or outline (non-text); text beside it stays navy. Disabled buttons use the component's disabled style and are exempt.
- Visual checks (screenshots read): sign-in with notice, enrolment 1b / 1c / 2c / 2d, backup codes confirmed, code prompt 2c, profile 3 and 5, staff 2, 3 and 5, the enrolment Note. The plain sign-in, the other enrolment and code-prompt states and the remaining in-session states are built from the same code paths and were checked through the audit, not individually.
- Not verified: a real browser rendering of the finished `apps/admin` build (nothing is coded); the F2 components were used as instances, not edited; `Admin Shell` property `Show Action Button` is off on every in-session frame (the action lives in the content, Decision Log #51).

## 8. Notes for the frontend agent

- The login answer is a union (session, `twoFactorRequired`, `twoFactorEnrolmentRequired`); the refresh gate answers a 401 with a body code. `apps/admin` handles none of these today; with `ADMIN_2FA_ENFORCED` on, the Console cannot sign in until it does (the reason the switch is off by default).
- Hold the enrolment session until the backup-codes checkbox is ticked.
- The in-session reset and the sign-in screens use different text families (Inter for admin, as in the shell); the logo wordmark is the brand's Montserrat.
- Register: this pass does not edit `docs/build-register.md`. B-271's Figma step is done by this pass; code in `apps/admin` is the next step.
