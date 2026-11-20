# Figma pass K2 report: general profile frames, guardian on-hold, verify-email prompt, DOB guardian fields

Date 2026-10-18. Branch `figma/pass-k2-profile-frames-and-states`, from `origin/main` `902e12d`. File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only: no application code, schema, legal copy, DPIA or `.docx`. Light mode only, 390 px mobile, Soccernity Theme variables, nothing deleted from the canvas.

Register rows touched: B-007, B-082, B-104, B-135, B-136, B-137, B-138 (status lines appended, `docs/build-register.md` section 24). No B-ID added or removed.

## 1. What was built

All new frames sit in a fresh band below the existing canvas (x 0 to about 8800 in the profile and consent rows, y 77200 and below), clear of every existing node.

### 1a. General profile frames (B-138, B-082, B-007)

Desktop frames are 1440 px, VERTICAL auto-layout root with a Navbar header 4 instance, a 796 px profile column and cloned parts of the pass H frames (cover, avatar, actions, identity, stats, tabs, post card). Built by creating auto-layout shells and cloning only the leaf parts, so nothing had to be removed from a clone. No new component was added.

| Frame | Id | Notes |
|---|---|---|
| Profile — Other User — Posts — Desktop | `6747:28894` | Message, "..." (Block trigger), Follow; tabs Posts (active) and Media only; country line shown (filled sample) |
| Profile — Own — Posts — Desktop | `6747:29094` | Edit Profile; tabs Posts, Media, Saved |
| Profile — Own — Media — Desktop | `6747:29291` | Media tab active; 3 x 3 grid of placeholder tiles (wrap auto-layout) |
| Profile — Own — Saved — Desktop | `6747:29445` | Saved tab active; two saved posts by other authors |
| Profile — Own — Posts — Mobile | `6747:29642` | clone of `5702:8250` |
| Profile — Own — Media — Mobile | `6747:29709` | clone of `5778:8490` |

The pass H pinned and blocked states were reused as they are, not as variants (a variant needs a component, and none may be added): pinned `6707:26727` / `6707:26938` (desktop), `6709:26922` / `6709:27056` (mobile); blocked `6707:26595` / `6706:26750`; Block menu open `6669:27188`; not found `6738:30391` / `6738:30526`. The note `6754:29553` names them.

Drawer: the "Signed in as" NAVIGATE on `I5874:10690;5870:10697` was re-pointed from `5702:8250` to `6747:29642` and read back from a fresh handle. A page-wide reaction scan (873 nodes with reactions) found that this was the only reaction targeting any of the four legacy frames, and a second scan immediately before archiving found none.

### 1b. Guardian confirm, "Approval is on hold" (B-135)

Desktop `6748:29330`, mobile `6748:29450` (clones of `5108:6629` / `5531:7626`). A "Panel — Approval On Hold" card (title and body from `GuardianConsentConfirmPage`, tag kept) is inserted after the request summary and its note; the "Report incorrect details" action is hidden (the code hides it when on hold); "I consent" is shown at 40% opacity; "I do not consent" is unchanged. The root height was extended to the card.

### 1c. Verify-email prompt (B-136, B-128)

Desktop `6750:29378` (prompt), `6750:29429` (link resent), `6750:29480` (rate limited); mobile `6750:29531`, `6750:29582`, `6750:29633`. Built from the Link Invalid frames (`5143:6661`, `5531:7356`): mail icon, "Verify your email to continue", sample address, "What to do" card with the three steps from `VerifyEmailPromptPage`, "I've verified — continue" and "Contact support", plus a resend row. The resent state shows the backend's generic message verbatim (`RESEND_VERIFICATION_GENERIC_MESSAGE`). The rate-limited state is the per-IP throttle; its message is a placeholder (see candidate 4).

### 1d. DOB correction, guardian fields (B-137, B-104)

`6752:29980` (form) and `6752:30141` (validation), clones of `6649:24980` / `6649:25217` on the Admin Shell, with sample dates changed to an adult (04 Sep 2005) corrected to a minor (04 / 09 / 2011) and a "Fieldset — Guardian details" holding the guardian's full name, the guardian's email and Relationship (select with chevron, "Select…"), taken from `CorrectDobPage`. In the validation frame only the three guardian fields are in error and the banner reads the code's message ("Enter the guardian's name, email and relationship."). Heights 1184 and 1253 (the Admin Shell instance was resized with the frame, as in earlier passes).

### 1e. Archive (B-138)

`1455:4362`, `1455:6626`, `5702:8250`, `5778:8490` hidden and renamed "ARCHIVED — ... (superseded by id name)", each only after its replacement existed. Listed in `docs/figma-archive-index.md` section 1g, together with the 13 hidden archived nodes that came along in the clones (section 2f). Live archived count after the pass: 414 = 61 top-level + 353 nested (83 host frames).

### 1f. Renames and housekeeping

- Carousel sets `6697:26234` / `6697:27448` and the two instances `6661:29097` / `6661:29294` (inside archived frames, name only): "3 pages of 3 finalists" to "2 pages of 3 finalists". The three notes that quoted the stale name were updated (`6664:27292`, `6664:27303`, `6698:26188`).
- Archive names citing deleted ids: the brief said two; three names carried them (Messages windows 1, 2 and 4: `1761:2342`, `1761:2321`, `1762:2645`). All three now cite `5709:8354` and `5709:8419`.
- Admin Shell (component set `6014:12948`, all 10 variants): the unbound paints are all inside boolean-operation icon glyphs (non-rendering input shapes). 37 of the 38 unbound paints per variant were bound: 32 navy fills to `brand/navy`, 2 black strokes to `brand/navy`, 3 grey (`#D9D9D9`) boolean-operation fills to `color/icon/inactive`. Each variant was exported as PNG before and after: byte-identical in all 10 variants, so nothing renders differently (the script reverts a variant on any difference; none was reverted). The remaining one, `Rectangle 223` (the sidebar wash, navy 12%), stays a literal on purpose (Decision Log #199: a bound `brand/navy` paint would render solid on instances). This was done on the component, not on one instance, because the shapes are identical in every instance.

## 2. Notes drawn on the canvas

Five Note instances (cloned from `6738:30554`): `6754:29553` (profile frames), `6754:29556` (mobile profile), `6754:29559` (guardian on hold), `6754:29562` (verify-email prompt), `6754:29565` (DOB guardian fields). Each starts "SCOPE OPEN" and lists the undecided points (section 5).

## 3. Copy and tags

Wording taken from code: "Approval is on hold" and its body; the three verify-email steps and headings; the resend confirmation; the guardian field labels, "Select…" and the validation message; the DOB help text.
Tagged `[COPY PENDING LEGAL REVIEW]` in the frames: the on-hold body; the resend link ("Resend verification email"); the rate-limit message ("Too many requests. Please try again in a little while."); the guardian-details help text. Wording about a child or guardian that was already tagged in the source frames kept its tag. Placeholder sample data (not copy): "ade.bello@example.com", "Confirmed by support ticket.", sample saved-post authors.

## 4. Audit

- Top-level nodes: 860 before, 881 after = 21 new (6 profile, 2 guardian, 6 verify-email, 2 DOB, 5 notes). The ids of the original 860, in order, hash to the same value before and after (djb2 `1340786041`).
- `findAll` count per top-level node: captured for all 860 before the first write. After the pass, 33 touched or adjacent nodes were recounted against it: 30 identical (including the Admin Shell set at 1060, both carousel sets, the cloned sources, the unarchived `1460:8940`, `5702:8250`, `5778:8490`, `1761:2342`, `1761:2321`, `1762:2645`); `6738:30554` (a note) was compared against a wrong baseline typed by me (0, the real value is 2) and is 2 before and after; `1455:4362` (2336 to 2231) and `1455:6626` (2291 to 2186) each dropped by 105. The 105 is the Navbar instance's sub-layers, which are not enumerated while the instance sits in a hidden frame (the same frame counted visible and hidden gives 2231 both ways, but the unarchived sibling `1460:8940` shows 105 sub-layers, the archived ones show 0). No node was removed. The other 827 top-level nodes were not recounted after the pass; nothing in the pass writes to them, and the id hash is unchanged.
- Paints on the new frames: 1222 solid paints, 2 unbound; both are the `Rectangle 223` wash inside the Admin Shell instance of the two DOB frames (Decision Log #199). Before that check 9 default white fills on containers I created (`Media Grid`, six `Resend row`, two `Fieldset`) were unbound; they were cleared (the frames sit on white, so nothing changed). No `brand/green-tint-28`, no new colour, no black.
- Overlaps: every new top-level node was checked against every visible top-level node: none.
- Visual checks (screenshots): other-user desktop, own Media desktop, mobile Media, guardian on-hold desktop, verify-email resent desktop, verify-email rate-limited mobile, DOB form and validation. Not screenshotted individually: own Posts and own Saved desktop, mobile Posts, guardian on-hold mobile, the other four verify-email frames (built by the same code as the checked ones; counts and bounds checked).
- No real browser or prototype playback.

## 4a. Things that went wrong and were fixed in the run

- A first read exceeded the 20 KB return limit (no write; split into smaller reads).
- Two build scripts threw (a wrong `Content` match inside the Admin Shell instance; text lookups) and rolled back atomically; rebuilt with the fix.
- The first DOB validation frame carried the source frame's red error strokes onto the DOB and reason inputs and the fieldset; corrected so that only the guardian fields show an error.
- Nine unbound default fills (above).

## 5. Hidden nodes left in new frames (not renamed)

Inherited from the cloned sources and left hidden: the ghost "Soccernity" text in the guardian and verify-email frames. Created by this pass and left hidden: the cloned warning icon's "Mark Stem" and "Mark Dot" and the "Note — OPEN DECISION" in the six verify-email frames; "Action — Report incorrect details" in the two guardian frames; five "Error" rows in `6752:30141`.

## 6. Decision Log candidates

1. The two mobile profile replacements are content-identical clones of frames that were already auto-layout. Archiving them only moves the pair into one naming family. Keep as done, or restore the originals and drop the clones?
2. Legacy `1460:8940` (own Saved, absolute layout, 2364 nodes) now has a replacement (`6747:29445`). Archive it too?
3. The pinned, blocked and menu-open profile states remain separate frames because no component or variant may be added. A profile component with a state property would remove the duplication.
4. Verify-email prompt: wording of the resend link and the per-IP rate-limit message is not decided; the per-account cap of 3 per hour returns the generic message, so it has no screen of its own. Whether the resend link shows before a first send, and any cool-down timer, are undecided.
5. Guardian on hold: the file has no disabled-button style (40% opacity used); the moment right after "Report incorrect details" is sent is not drawn; the footnote under the buttons still holds the old decline wording (B-130).
6. DOB correction: the code shows the guardian fields only after the server asks for them; they are drawn in the revealed state. The Confirm and Success frames (`6649:25463`, `6649:25721`) do not mention the guardian request; undecided whether they should.
7. The country line shows a filled sample on the general frames; the pass H frames hide it. Only-when-filled is the rule (#403 item 17); which sample state is canonical is not decided.
8. The Admin Shell grey boolean-operation fills were bound to `color/icon/inactive` (15% navy) because no solid grey token exists; invisible today, but a future edit to those shapes would show that colour.
9. The Media and Saved tabs have no media-type marker (video, duration), no empty state, and no loading state.
10. Registers and reports quote the brief's "two archive names"; three carried deleted ids.

## 7. Not done

- Own Saved desktop `1460:8940` not archived (not in the brief).
- Mobile Saved `5778:8567`, other-user mobile `6669:27188` unchanged.
- Confirm and Success frames of the DOB correction unchanged.
- No whole-page `get_metadata` (standing limit, Decision Log #404 item 14).
