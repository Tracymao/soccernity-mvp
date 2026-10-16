# Figma pass F1 — report

Branch `figma/pass-f1-resync`, 2026-10-16. Agent scope: `figma-design-system` (re-sync of EXISTING frames per build-register row B-107, Decision Log #394-#401 and the amendments of #402). Figma file "Soccernity-MVP" (`weZWWqggy9j13eX8bhFgs6`), page `0:1`. Figma + docs only: no application code, schema, legal copy, DPIA or `.docx` was changed, and no Decision Log row was written.

**On "#403".** The brief names Decision Log #403 as "the docs fix". The Decision Log docx has no row #403 (highest is #402). #403 is the PR number of `docs/decisions-defaults-2026-10-16`, which recorded #402. This pass applied #402 (sessions stay valid between declines, the 'declined' login result is withdrawn, third decline keeps the 30-day grace, block effects, week-4-only exposure settings) wherever it amends #394-#401.

## 1. Audit numbers

| Check | Result |
|---|---|
| Whole-canvas metadata (page `0:1`, full tree) before / after | 42,532 / 44,836 node ids. **0 nodes missing.** 2,304 ids are new. Both pulls (5.4 MB and 5.7 MB) were saved and diffed by id. |
| Concurrent writer | **Another session wrote to this file while this pass ran:** top-level frame `6671:27364` "Components — Admin & Shared (Pass F2)" (235 nodes) appeared between my pulls (ids interleave with mine). It is not part of this pass. Net of it, this pass added about 2,069 nodes (1,175 inside the 25 top-level nodes below, the rest inside existing frames). I cannot exclude that the same session also edited existing nodes; see the next row. |
| Existing nodes changed | 380 ids changed name, position or size (includes pure text-driven reflow of auto-layout frames, renames of archived nodes, moved frames and notes, and any edits by the concurrent session that I cannot separate). Text and fill edits are not visible to that diff; they are listed per item in section 2. |
| Deleted | **Nothing deleted.** Superseded content is hidden and renamed `ARCHIVED — …`. A few clones I made myself and replaced within the same session were removed (none from the baseline). |
| Paints on nodes created this session (id prefix 6669-6673, 2,726 nodes incl. the concurrent frame) | **1,744 solid paints, 1,744 bound to `Soccernity Theme` variables, 0 unbound, 0 black.** Image fills (video, avatars) are reused from existing nodes by hash. |
| Overlaps (visible top-level nodes) | 4 overlaps were found on the first check (my admin dialog frames against moved archive notes, and one note against a pass C note); all were moved clear and re-checked: **0**. |
| Frame heights | Admin frames: Create 2,343, Create Validation 2,459, Edit 2,347, Edit Save Error 2,411, new dialog / state frames 1,184 and 1,234 (Appeal Review). All ≥ 1,184 and keep the Admin Shell instance (resized to the frame height). Mobile frames are 390 wide; the two forfeit pop-up frames are 1440×900 and 390×844 (844 viewport). |
| Variables | Light mode only. `brand/navy`, `brand/green`, `brand/green-tint`, `color/background/page`, `color/background/surface`, `color/text/primary`, `color/text/secondary`, `color/text/on-navy`, `color/text/on-green`, `color/icon/inactive`, `color/overlay/scrim`, `semantic/alert` (3-4px bars and input outlines only, never text or a button), effect style `elevation/overlay`. No new colour, no hex. |
| Screenshots | Every changed frame family was rendered after its last edit and read (Age Gate desktop, Activation mobile, web consent mobile, Approved mobile, Restricted Pending mobile, Create Profile mobile, Create Contest Validation, Between Weeks desktop, new Already Voted desktop, Already Voted mobile, forfeit pop-up mobile, Held Investigations, Bad Faith dialog, Report Detail hold-active, other-user profile variant). Not re-rendered individually: desktop Activation, desktop Restricted Pending, both Change Guardian Email frames, the three Edit / Save Error frames, the Appeal Review hold-active state (checked by metadata and node diff only). |

## 2. Per item — what changed, with node ids

### A — Sign-up and Create Profile (#394)

| Item | Frames | Change |
|---|---|---|
| A4 Age Gate | `5108:6626`, `5539:7264` | Heading "What's your date of birth?" → "Date of birth and country" (`5110:6645`, `5539:7284`); subheading → "We ask everyone this when they join. Your date of birth is never shown on your profile." (`5110:6646`, `5539:7285`). Tag chips `6669:27179`, `6669:27181` ("[COPY PENDING LEGAL REVIEW]", covering heading and subheading). Clear-on-Back is behaviour, so it is a note, not a drawing (note `6673:27346`). |
| A5 Activation | `5108:6631`, `5531:7544` | Heading "Your account is approved, Ade"; body "…Continue registration to finish setting up your profile." [tagged]; section "Switched on when you finish registration"; row titles in future tense; pills ON → SOON. Mobile frame grew 1,522 → 1,722. |
| A5 Approval email | `5501:8584` | Body rewritten to "approved… Continue registration to finish setting up your profile." [tagged]. |
| A1-A3, A6 Create Profile | `1498:2303`, `1629:2449` | Picture label "Add a Profile Picture (Optional)" (`1498:2512`, `1629:2479`); automatic-image-check hint beside / under the picture [tagged]; new state frames `6672:29251` (desktop) and `6672:29235` (mobile) show a flagged Bio and Preferred Club with the inline "Please rephrase". Full Name and Country were already as #394 A1 decides (pass B). No new screen for a restricted-pending minor (A6). |

### C — Profile variants (#396, #402)

| Item | Frames | Change |
|---|---|---|
| C1 other-user variant | new `6669:27188` "Community — Profile — Other User — Mobile" | Cloned from `5702:8250`: Edit Profile → **Follow**, a Message icon button and a "…" **Block trigger** button; the open menu (Copy Profile Link, Block christine001) hangs under the trigger; Block row navigates to the existing confirmation `6655:29600`. Own-only "Saved" tab hidden and renamed `ARCHIVED —`. Icon fills bound. |
| Variant naming | `5702:8250`, `1455:4362`, `1455:6626`, `1460:8940` | Renamed with "Own" / "Other User variant (#396 C1)" suffixes so the two variants are no longer ambiguous. |
| Legacy defects on `1455:4362` | | "© 2022 Soccernity" → "© 2026" (`1455:6388`); "Privacy Settings" link `1455:6390` and its bullet `1455:6393` hidden and renamed `ARCHIVED —` (Decision Log #222 Part 4). The sample dates "08/08/2022" are sample content and were left. |

### E — Contest (#399, #400, #401)

| Item | Frames | Change |
|---|---|---|
| E1 Title | `6643:21602`, `6643:21973`, `6644:21820`, `6644:22188` | New first field "Contest title (required)" with "0 / 80 · Maximum 80 characters." (Create) or "17 / 80" with value "October Challenge" (Edit). The Validation frame shows the red outline and "Contest title is required." and its banner counts 5 fields. The helper "Create is blocked until the contest title, …" was updated. |
| E2 week-4-only switch | same four | The followers-excluded toggle row is hidden and renamed `ARCHIVED —` in weeks 1-3 (3 rows per frame, 12 over the four frames); it remains in week 4 only. |
| E3 final task text | same four | New "Final task" field in the Week 4 block with the hint "Shown at the bottom of the leaderboard page." Also a **Final task** block (placeholder text "The final task, as written by the admin, appears here.") above the data-rule note on `5524:7512`, `5541:7527`, `6659:26310`, `6659:27163`. |
| E6 / E7 Between Weeks | `5802:9183`, `5815:8948` | Body → "Voting for this week's challenge closed at 20:00. This week's result is below. The next week opens at 08:00." plus a "This week's result" card (1st / 2nd / 3rd with +500 / +300 / +150 pts, sample users) and "The next week opens at 08:00 on day 8." |
| Stale lock wording (B-107) | `2220:1204`, `5801:8663`, `6241:14673`, `6241:14685`, `6644:22828`, `6664:27321` | "Voting closes at 23:59:59 on day 7" → "…20:00:00…", "Voting open until 21 Oct 23:59:59" → "…20:00:00", the pass E Between Weeks note bullet corrected. "23:59:59" remains only where it is the week-4 upload deadline (day 24, unchanged by #400). No visible text says the next challenge opens "the next day". |
| E8 hidden tab | `6660:31044`, `6660:35699` | Both "closed (not a finalist)" frames and their notes archived (hidden, renamed, moved to the archive strip at y 59,400). Notes `6671:28750` (desktop) and `6671:28753` (mobile) mark `6171:16994` / `5982:10932` ("No Active Contest") as the state a non-finalist sees on days 22-24. |
| E9 vote toggle | component set `6670:28355` (`State=Vote` / `State=Voted`) | Used on `2094:994` (`6671:27432`), `5802:8726` (`6671:27438`), `5815:8916` (`6671:27443`) and the rebuilt Already Voted. Old Vote / Voted / Retract buttons hidden and renamed `ARCHIVED —`. Vote → Already Voted → Voting navigation re-wired; the reaction that pointed at `5802:8978` was repointed. Voting desktop intro no longer says "thre" or "only vote once". Mobile Already Voted banner rewritten. |
| Legacy Already Voted | old `5802:8978` → new `6671:27155` | Rebuilt on auto-layout (VERTICAL root, navbar instance, body with entries column and board column, fan cards in a wrapping row) with every paint bound; the new frame sits at the old position, the legacy frame is hidden, renamed `ARCHIVED —` and moved to y 59,400. |
| E10 showcase | `6661:29122`, `6661:29321` | Archived (hidden, renamed, moved, notes prefixed). The dead "View this contest" links on the live-ranking frames (`5524:7730`, `5541:7711`) were cleared, hidden and renamed. The Community-feed "Final week" module and its components were **not** touched (still open in #402). |
| E11 forfeit pop-up | new `6671:28756` (desktop), `6671:28764` (mobile) | Scrim + dialog: "Week 2 was forfeited" / "Fewer than 3 entries were submitted this week, so no winners were chosen and no placement points were awarded." / OK. Opens from the "Week 2 · Forfeited" chip on `6659:25987` (`6659:26046`) and `6659:26981` (`6659:27039`) with an OVERLAY reaction. |

### D — Admin moderation (#398)

| Item | Frames | Change |
|---|---|---|
| Hold type + lift | `6647:23351` | Columns reflowed; new HOLD TYPE marker cell (Open report / Legal hold / Reporter acted in bad faith) and ACTION cell with **Lift hold** (— for an open-report hold). |
| Confirmation + reason | new `6672:27278` Bad Faith, `6672:27349` Legal Hold, `6672:27420` Lift Hold | Clones of Report Detail with scrim and the Reject-dialog layout; reason field (required) on the first two; Cancel / ✕ → `5796:8635`; confirm → hold-active state (or Report Detail for Lift). |
| Hold-active states | new `6672:28898` (Report Detail), `6672:29059` (Appeal Review) | A "HOLD / Legal hold / Active since 14 Oct 2026 / Lift hold" row under the title; Lift hold → `6672:27420`. |
| Appeal Review actions | `5796:8753` (`6635:22221`, `6635:22223`) | Wired to the same Bad Faith / Legal Hold dialogs (the dialog's background is the Report Detail clone). Report Detail buttons `6635:22212`, `6635:22214` wired likewise. |

### Defects fixed on frames touched

| Defect | Result |
|---|---|
| Web consent mobile `5531:7626` DOB value overflow | Value now wraps and fills the row (two lines); thin "I consent" / "I do not consent" bars (26px) also made 48px; frame grew 2,390 → 2,526. |
| Change Guardian Email mobile `5501:8536` button bars | 26px → 48px, Actions frame hugs. |
| Mobile Activation `5531:7544` and Restricted Pending `5531:7461` thin bars | 48px; Activation grew to 1,722 (content had been clipped). |
| Restricted-pending "players" (#377) | "Follow teams, players and grassroots leagues." → "Follow teams and grassroots leagues." (`5114:6686`, `5531:7515`). |
| Create Profile mobile 104px empty space | `paddingTop` 104 → 0; frame 1,501 → 1,397 → 1,450 with the new hint. |
| Profile `1455:4362` legacy "Privacy Settings" / "© 2022" | See section C. |
| Consent email link host | `soccernity.app` → `soccernity.com` (`5112:6630`). |
| Security-alert email `[security email]` | → `support@soccernity.com` in `1380:2299` and, the same defect, in the password-changed email `1380:2320` (Decision Log #37). |
| Guardian consent frame 4 "withdraw consent at any time" | Small print `5113:6744` / `5531:7738` now reads "…at any time on the guardian withdrawal page." [tagged] and is linked to `6654:2` / `6654:26727`; the consent email sentence and the two Approved screens (`5488:7196`, `5501:8257`) link the same way. |
| Decline page | **Unchanged.** One behaviour note beside it (`6673:27349`). |

## 3. "[COPY PENDING LEGAL REVIEW]" tags added

| Where | Node ids | New wording |
|---|---|---|
| Age Gate heading + subheading | `6669:27179`, `6669:27181` (chips) | "Date of birth and country" / "…Your date of birth is never shown on your profile." |
| Activation body (desktop / mobile) | `5114:6721`, `5531:7561` | "…Continue registration to finish setting up your profile." (heading, section title and row titles are covered by the same sentence's tag) |
| Approval email | `5501:8586` | "…approved your Soccernity account. Continue registration…" |
| Consent email | `5112:6633` | "If you give consent and later change your mind, you can withdraw it from the guardian withdrawal page." |
| Web consent small print | `5113:6744`, `5531:7738` | "…at any time on the guardian withdrawal page." |
| Approved (guardian) | `5488:7196`, `5501:8257` | "…at any time on the guardian withdrawal page." |
| Create Profile image-check hint | node named "Field Hint — automatic image check (#394 A2)" in `1498:2303` and `1629:2449` | "Pictures are checked automatically before they appear on your profile." |
| Bad faith / Legal hold / Lift hold dialogs | body and helper text in `6672:27278`, `6672:27349`, `6672:27420` | "…holds the reporter's account in full for 6 months."; "…holds both accounts in full until an admin lifts it."; "Lifting the hold releases both accounts."; "The reason is saved to the audit record."; "Lifting a hold is saved to the audit record." |

Untagged new wording (contest and admin microcopy composed from `docs/contest-spec.md` and the decisions; reviewed here so it can be checked): the E1-E3 field labels and hints; "Contest title is required."; the Between Weeks body and result card; the forfeit pop-up title and reason; the "Final task" block; "Please rephrase" (the words of #394 A3); "You've already voted this week. Click Voted to remove your vote until voting closes at 20:00:00 on day 7."; "Vote for your preferred video entry. You have one vote: click Voted again to remove it, then vote for another entry."

## 4. "SCOPE OPEN" notes (on canvas)

New notes (all names start "NOTE — … (W0 pass F1)"): `6673:27346` Age Gate, `6673:27347` Activation, `6673:27348` emails, `6673:27349` decline-page behaviour, `6673:27350` other-user variant, `6673:27351` vote toggle, `6673:27352` forfeit pop-up, `6673:27353` Create / Edit Contest, `6673:27354` holds, `6673:27355` 2FA recovery (for screen-builder), `6673:27356` pinned final entry (for screen-builder), `6671:28750` / `6671:28753` hidden tab. Older notes whose open point is now decided were prefixed "UPDATED / SUPERSEDED / RESOLVED BY W0 PASS F1": `6664:27308`, `6664:27319`, `6650:25169`, `6650:25217`, `6637:21610`-`6637:21612`, `6626:22224`-`6626:22227`, `6627:22224`, `6627:22225`, `6627:22232`, `6627:22233`, `6628:22217`.

## 5. Not built — for screen-builder

1. **Block states list**: Settings > Blocked users (list, empty, unblock confirmation) and a blocked-profile state; the Block confirmation `6655:29600` still sits on a clone of the OWN profile and should be rebased on `6669:27188`.
2. **2FA recovery states** (#397 / #402): backup codes shown once, lost-device recovery (backup code, or email confirmation plus password), turn off with password, manual key, login-time code prompt.
3. **Pinned-profile final entry** (#400 E10): a finalist's entry pinned on their own profile with the contest label and engagement locked before the reveal.

## 6. Decision Log candidates (none written)

1. **#403 does not exist in the log.** Confirm whether a row was intended (the brief's "the docs fix").
2. The decline page's in-frame notice `6627:22230` states the cap ("A guardian can decline up to 3 times…"); #395 says no decline count is shown anywhere. Left unchanged on instruction; keep or remove the cap sentence?
3. Activation rewrite (future tense row titles, pills "SOON") goes beyond "approved, continue registration"; the guardian-facing Approved screen (`5488:7164`, `5501:8225`) still says "Ade's account is now active… They can sign in" — same inconsistency (#367), not touched.
4. Age Gate subheading now says only the date of birth is never shown; whether the country is shown on a minor's profile is #371 ("country visibility incl. minors") and the other-user profile frames show it.
5. Lift hold: does it apply to the 6-month bad-faith hold; does lifting need a reason; should lifting a hold notify the held user. The "saved to the audit record" sentences are composed, not decided.
6. Appeal Review opens the Report Detail-based dialogs; separate Appeal Review dialog frames, or one shared component?
7. Vote toggle: "Voted" is brand green; whether the Already Voted page remains as a screen (#401 open); toggle label when a vote is retracted for the entrant's tally is not shown.
8. Forfeit pop-up: where it appears (leaderboard Contest tab only?), how often, and whether the reason wording (composed from contest-spec section 7) is the final text.
9. Final task: placeholder wording for the leaderboard block; whether it also appears while the final is live (drawn on live ranking and uploading only, not on Crowned / No winner).
10. Create Contest title example "November Challenge" is the decision's example on an October contest; tolerance and per-viewer cap (week 4 only, #402 item 6) are not on the create form (they live on the impression settings screens).
11. E4 (locking after launch) and E5 (ranges) are not in B-107 and were not drawn.
12. The Community-feed "Final week" module and the finalist rotation are still open (#402); its "View on the Contest page ›" link has no destination now that `6661:29122` is archived (no reaction existed to clear).
13. Other-user mobile variant: the open menu overlays the identity block (as an open menu does); whether the "…" menu or an inline Block row is the mobile pattern.
14. Concurrent session "Pass F2" wrote `6671:27364` into this file during this pass.

## 7. Disclosures

- My first attempt at the archive step failed because some notes are frames rather than text nodes; Figma rolled the whole run back (nothing persisted) and the step was re-run correctly.
- Several frames here are auto-layout inside an absolute shell: after text edits the root frame had to be resized to contain its content (`resizeWithoutConstraints`), and growth was verified by reading each frame's deepest visible descendant, not by eye.
- Not verified: prototype playback (links and overlay reactions were read back, not played); the Appeal Review hold-active state and the three Edit frames by screenshot.
