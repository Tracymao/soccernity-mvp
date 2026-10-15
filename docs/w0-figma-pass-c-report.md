# W0 Figma pass C — report

Branch `figma/w0-pass-c-admin-screens`, 2026-10-15. Agent scope: `figma-screen-builder` (new admin screens only). Figma file "Soccernity-MVP" (`weZWWqggy9j13eX8bhFgs6`), page `0:1`. Figma only: no application code, schema, legal copy, DPIA or Decision Log row changed.

Source rows: `docs/build-register.md` B-095 (screen-builder leg), B-012 (screen-builder leg), B-104. Decisions applied: #345, #369, #371, #376, #381, #385, #386, #387, #388, #390, #393, `docs/contest-spec.md` §3, §4, §5, §9c, §9d, §10, §10b, §11, §12, §13. Endpoint shape read from `services/api/src/modules/admin-users/` (held investigations).

## 1. Audit numbers

| Check | Result |
|---|---|
| Whole-canvas metadata (page `0:1`) before / after | before pull saved to disk (4.1 MB, 36,313 id-bearing nodes by the regex used), after 38,760. **0 nodes missing, 0 existing nodes changed** (id, name, x, y, width, height compared), **2,447 new nodes**. The in-Figma audit counts the same 2,447 (nodes outside component instances). |
| New frames | **36** top-level frames (35 admin screens + 1 Design Notes frame) and **26** note frames. |
| Deleted / hidden / edited existing | **Nothing deleted, hidden or edited.** The only existing nodes used are read-only: the Admin Shell component set `6014:12948`, the Settings Toggle set `5694:8219`, the variables and the `elevation/overlay` effect style. |
| Unbound fills / strokes on authored nodes | **0** across 2,447 nodes (every SOLID fill and stroke is bound to a `Soccernity Theme` Light variable; no hex; no non-solid paints). Re-checked after the repair in §7. |
| Overlaps | **0** between the 36 frames + 26 notes and every visible top-level node of the freshly pulled canvas (630 visible top-level nodes), checked again right before finishing. |
| Frame heights | Every admin frame ≥ 1184. Heights: Create 2239, Create validation 2407, Edit 2241, Edit save error 2305, Before reveal 1248, Settings validation 1256, all others 1184. No pinned/sticky frames (desktop only). |
| Admin Shell | 35 instances of the component set, `Show Action Button = false`, `Active` = Contest (17), Moderation (9), Users (9). |
| Variables | Light mode only. `brand/navy`, `brand/green`, `brand/green-tint`, `brand/off-white`, `color/background/surface`, `color/text/primary`, `color/text/secondary`, `color/text/on-navy`, `color/icon/inactive`, `color/overlay/scrim` and `semantic/alert` (3px error bars, input outlines on error and banner bars only; never text, never a button). |
| Effect styles | `elevation/overlay` on the 6 dialogs. |
| Placement | Two bands, both verified clear of every existing node before building. Band A (near the Admin Contest area): x 40923 → 58563, y −11700 and −8900. Band B: x 79600 → 97240, y −11700 and −8900. No frame sits on the parked Admin Shell set (`x 37803–53203, y −17606–−16382`) or the Contest archive strip (`y −13200`). |

## 2. Per B-ID — node ids

No existing frame was changed, so "before" is "no frame exists" for every row below. Reference frames that this pass leaves alone are listed under each ID.

### B-095 — Admin Contest tab redesign and impression view
Replaces the archived judging screens (archived by pass B). Reference only, untouched: archived frames `6274:15676`–`6276:16213`; the older console frames `6266:14767`–`6277:16282` and Design Notes `6278:16383` still carry pass B's "TO BE REDESIGNED (B-095)" tag.

| Frame (Admin Shell: Active = Contest) | Node id | Size | Position |
|---|---|---|---|
| Create Contest (required fields empty, Create blocked) | `6643:21602` | 1440×2239 | 40923, −11700 |
| Create Contest — Validation (tally + 3 watch limits) | `6643:21973` | 1440×2407 | 42543, −11700 |
| Edit Contest (running contest) | `6644:21820` | 1440×2241 | 44163, −11700 |
| Edit Contest — Save Error | `6644:22188` | 1440×2305 | 45783, −11700 |
| Overview — Running (weeks 1–3, week 4 final, Forfeited shown) | `6644:22559` | 1440×1184 | 47403, −11700 |
| Overview — Final (No winner this month) | `6644:22852` | 1440×1184 | 49023, −11700 |
| Overview — No Contest (empty) | `6644:23174` | 1440×1184 | 50643, −11700 |
| Overview — Load Error | `6644:23391` | 1440×1184 | 52263, −11700 |
| Cycle History | `6645:22444` | 1440×1184 | 53883, −11700 |
| Cycle History — Empty | `6645:22705` | 1440×1184 | 55503, −11700 |
| Cycle History — Load Error | `6645:22922` | 1440×1184 | 57123, −11700 |
| Finalist Impressions (9 finalists, 1 outside tolerance) | `6646:22745` | 1440×1184 | 40923, −8900 |
| Finalist Impressions — Fewer Than 9 Finalists | `6646:23097` | 1440×1184 | 42543, −8900 |
| Finalist Impressions — Before Reveal | `6646:23419` | 1440×1248 | 44163, −8900 |
| Finalist Impressions — No Finalists | `6646:23765` | 1440×1184 | 45783, −8900 |
| Finalist Impressions — Settings Validation | `6646:23984` | 1440×1256 | 47403, −8900 |
| Finalist Impressions — Load Error | `6646:24345` | 1440×1184 | 49023, −8900 |

What the form holds (contest-spec §4): contest description; per-week weekly task as free text (no option list); required minimum tally with no default (Create blocked, inline validation); placement points weekly 500 / 300 / 150 and monthly 2,000 / 1,200 / 600 prefilled and editable; required per-week view-qualifying watch limit in seconds (weeks 1–3); per-week followers-excluded switch. The overview shows Europe/London dates (week 1 = 1–7, 2 = 8–14, 3 = 15–21, week 4 = 22–31; Phase 1 days 1–4 and Phase 2 days 5–7 of each week; upload 22–24 with deadline 23:59:59 on day 24; reveal 25 Oct 00:00; engagement window 25–31) and shows Forfeited and No winner this month as read-only status. No admin judging, crowning or opening control appears on any frame. The impression view shows per-finalist counts, mean, the ±10% band, an outside-tolerance flag, and the two settings (tolerance 10%, per-viewer daily cap 3).

### B-012 — held investigations, flagged-image queue, username revoke
Reference only, untouched: pass B's Report Detail `5796:8635` and Appeal Review `5796:8753` (bad-faith and legal-hold actions).

| Frame | Node id | Size | Position |
|---|---|---|---|
| Held Investigations (Active = Moderation) | `6647:23351` | 1440×1184 | 79600, −11700 |
| Held Investigations — Empty | `6647:23603` | 1440×1184 | 81220, −11700 |
| Held Investigations — Validation (olderThanDays 0–3650) | `6647:23831` | 1440×1184 | 82840, −11700 |
| Held Investigations — Load Error | `6647:24060` | 1440×1184 | 84460, −11700 |
| Flagged Images | `6647:24318` | 1440×1184 | 86080, −11700 |
| Flagged Images — Reject Dialog | `6647:24566` | 1440×1184 | 87700, −11700 |
| Flagged Images — Reject Dialog — Validation (reason required) | `6647:24833` | 1440×1184 | 89320, −11700 |
| Flagged Images — Empty | `6647:25103` | 1440×1184 | 90940, −11700 |
| Flagged Images — Load Error | `6647:25320` | 1440×1184 | 92560, −11700 |
| User Detail (host for the two support actions; Active = Users) | `6647:25540` | 1440×1184 | 94180, −11700 |
| User Detail — Revoke Username Dialog | `6647:25789` | 1440×1184 | 95800, −11700 |
| User Detail — Username Revoked | `6649:24462` | 1440×1184 | 79600, −8900 |
| User Detail — Revoke Username Error | `6649:24714` | 1440×1184 | 81220, −8900 |

Held investigations columns are exactly the `GET /admin/users/held-investigations` response: `userId`, `displayName`, `email`, `heldSince`, `daysHeld`, with `olderThanDays` default 90 (0–3650 per `HeldInvestigationsQueryDto`) and `thresholdDays` echoed. The hold is shown as visibility only, with no auto-timeout or action (#345). Flagged images: no endpoint, model or Rekognition integration exists, so columns are inferred from #371 only (kind, uploader, flagged at, not live). The user detail screen did not exist; it shows only fields `GET /admin/users` returns (`id`, `displayName`, `username`, `email`, `accountStatus`, `createdAt`).

### B-104 — Admin DOB correction
| Frame (Active = Users) | Node id | Size | Position |
|---|---|---|---|
| Correct Date of Birth (current DOB read-only, new DOB, required reason) | `6649:24980` | 1440×1184 | 82840, −8900 |
| — Validation | `6649:25217` | 1440×1184 | 84460, −8900 |
| — Confirm dialog (consequences) | `6649:25463` | 1440×1184 | 86080, −8900 |
| — Success | `6649:25721` | 1440×1184 | 87700, −8900 |
| — Error (dialog with error banner) | `6649:25952` | 1440×1184 | 89320, −8900 |

### Design Notes
`6650:25260` "Admin — W0 Pass C — Design Notes" (90940, −8900, 1440×1184): screen → endpoint → fields, what was reused, requests, tag list, Decision Log candidates.

## 3. "[COPY PENDING LEGAL REVIEW]" tags

Only wording that processes images or personal data was tagged; other admin microcopy is functional placeholder wording and untagged.

| Where | Text node ids | Wording |
|---|---|---|
| Flagged Images list, Reject dialog, Reject validation (callout) | `6647:24534`, `6647:24782`, `6647:25049` | "Images flagged at upload are not live until an admin reviews them. Approving makes the image live; rejecting keeps it off the profile and records a reason. [COPY PENDING LEGAL REVIEW]" |
| Reject dialog, Reject validation | `6647:24831`, `6647:25101` | "The image stays off the profile. [COPY PENDING LEGAL REVIEW]" |
| Revoke dialog, Revoke error | `6647:26050`, `6649:24978` | "This removes @adab from Ada Bello’s account. [COPY PENDING LEGAL REVIEW]" |
| DOB form, validation, error-state base | `6649:25211`, `6649:25457`, `6649:25694`, `6649:26183` | "Correcting the date of birth re-runs the age-tier checks and can start the guardian flow. You confirm the consequences before anything changes. [COPY PENDING LEGAL REVIEW]" |
| DOB Confirm and Error dialogs | `6649:25717`–`6649:25719`, `6649:26209`–`6649:26211` | Three consequence lines: age-tier checks re-run (under-13, under-16, under-18 flags, card-verification policy, restrictions); an adult account that has never gone through the guardian flow becomes a minor account → guardian flow starts; correction recorded in the audit log with the reason. Each line tagged. |
| DOB Success | `6649:25951` | "The age-tier checks have been re-run and the correction is in the audit log. If the correction turned an adult account into a minor account, the guardian flow was started. [COPY PENDING LEGAL REVIEW]" |
| Design Notes heading | `6650:25277` | Section heading listing the tag (documentation, not product copy). |

Wording taken verbatim from a Decision Log row or the shipped endpoint and left untagged: "Forfeited", "No winner this month", "Voting open", the placement defaults, "Reporter…" labels (pass B), the held-investigations hold description (#345), "Tolerance" and "Per-viewer daily cap" settings (#388).

## 4. "SCOPE OPEN" notes (each is an on-canvas note below its frame, not a decision)

| Frame | Note id | Open point |
|---|---|---|
| Create Contest | `6650:25169` | Own title field vs month + description; final has no task or limit (spec silent); switch drawn on every week although §10 defines it for week 4 only; min/max watch limit and placement ordering unspecified; dates not editable. |
| Create validation | `6650:25176` | Server validation wording; allowed watch-limit range. |
| Edit | `6650:25180` | Which fields stay editable once running or after a week starts. |
| Edit save error | `6650:25184` | Causes of save failure. |
| Overview running | `6650:25187` | Entries column and wording illustrative; per-week read-only entry list not specified. |
| Overview final | `6650:25191` | Whether admins see each finalist's likes + comments breakdown. |
| Overview no contest | `6650:25195` | Create for another month; more than one contest per month. |
| Cycle History | `6650:25198` | Columns beyond status; detail screen not designed. |
| Impressions standard | `6650:25201` | Counting window and mean basis; ranges for tolerance and cap. |
| Impressions fewer than 9 | `6650:25205` | Cause note illustrative. |
| Impressions before reveal | `6650:25208` | Whether admins can see a finalist count before the reveal. |
| Impressions no finalists | `6650:25211` | Whether the settings card is hidden when there is no final. |
| Impressions settings validation | `6650:25214` | Allowed ranges. |
| Held investigations | `6650:25217` | Endpoint returns no hold type or report; "lift hold" control (#376) not specified. |
| Held validation | `6650:25221` | Wording placeholder; range from DTO. |
| Flagged images | `6650:25224` | No endpoint or model; image vs blurred preview; automated-check label; CSAM / statutory path (counsel pending, #371). |
| Reject dialog | `6650:25228` | Whether the reason is shown to the uploader; free text vs list; what happens next; re-upload. |
| User detail | `6650:25231` | Host screen built only to reach the actions; no admin endpoint returns the date of birth. |
| Revoke dialog | `6650:25235` | Reason required?; what the user sees and must do; audit and fields; released-handle holding period. |
| Username revoked | `6650:25238` | What others see for an account with no username. |
| Revoke error | `6650:25241` | Error causes. |
| DOB form | `6650:25244` | **Effect on an in-flight guardian request is NOT specified (#390)**; accepted DOB range; audit record fields; whether anyone is notified. |
| DOB validation | `6650:25248` | Date format and range. |
| DOB confirm | `6650:25251` | Consequence lines come from #390; in-flight request effect not stated. |
| DOB success | `6650:25254` | Whether the guardian-flow outcome is shown depends on the backend response. |
| DOB error | `6650:25257` | Error causes. |

## 5. Decision Log candidates (none written)

1. Admin "lift hold" / legal-hold list control and where it lives (#376); whether the held list shows hold type and the holding report.
2. Flagged-image queue: image, blurred preview or none for the reviewing admin; CSAM escalation path (#371, counsel pending).
3. Revoke username: reason required, consequences for the user, audit fields, released-handle holding period (#369).
4. DOB correction: audit record fields, accepted range, effect on an in-flight guardian request, notification (#390).
5. Contest edit rules after launch; whether the followers-excluded switch is per week (task brief, §4) or week 4 only (§10); whether the final has a task text.
6. Allowed ranges for watch limit (seconds), tolerance (%) and per-viewer daily cap.
7. A single-user admin read and a user-detail screen (none exists; DOB is returned by no admin endpoint).
8. A contest title field (the old model had a cycle title; the spec lists none).

## 6. Requests for figma-design-system (nothing built here)

- No reusable Admin form-field, pill, table, callout, dialog or button components exist; every new screen uses local auto-layout frames with identical bindings. Request components for Field, Pill, Table, Callout, Dialog, Button.
- No text styles exist; text sets Inter family, weight and size directly (Semi Bold 28 / 20 / 16 / 14 / 13, Medium 12, Regular 14 / 13 / 12).
- No error-state definition for inputs; this pass uses a `semantic/alert` outline plus a 3px alert bar (non-text).
- The old console frames and Design Notes `6278:16383` still describe the judged model and carry the pass-B tag; archive them once these screens are adopted.

## 7. Self-review (screenshot by screenshot)

Every frame was rendered after its last edit and read. Findings and fixes:

- Create, Create validation, Edit, Edit save error: sections, required markers, error bars and disabled primary read correctly; the validation banner count matches the four flagged fields. **Fixed:** the Edit frames' placement hint said "Prefilled with the defaults"; reworded for edit.
- Overview running / final / empty / error: **Fixed:** the top row of the running and final overviews carried 2–3 buttons that ran under the shell's Log Out button; buttons moved to an actions row below the spacer (verified by re-render).
- Cycle History ×3, Impressions ×6: table, bars and flags read; **fixed:** impression counts lacked thousands separators (24 text nodes).
- Held ×4, User Detail, Revoke ×4, DOB ×5: dialogs sit over a dimmed copy of the base screen, shell visible; no clipping.
- **Bug found and repaired:** in Flagged Images list and Reject Dialog the thumbnail, "Not live" pill and Approve/Reject cells were empty, because the same cell nodes had been reused across three frames in one build (only the last frame kept them). Rebuilt for the two frames (9 cells), re-rendered and re-audited: 0 unbound paints across 564 nodes.
- Design Notes frame renders as a text column; text is dense by design.
- Not verified: behaviour in the Figma prototype (no reactions were added); the Settings Toggle instances inherit the component's own paint bindings.

## 8. Observed, not changed

- The admin shell shows a "Search Soccernity" band and a Log Out button inside the top-bar area on every admin frame (existing component); the spacer convention (117px) is kept.
- The shared Admin Shell avatar is an image fill inside the component instance (pre-existing component debt, excluded from the audit).
