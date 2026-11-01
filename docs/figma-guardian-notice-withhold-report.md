# Figma: Admin Console "withhold guardian notices" screens (Decision Log #458)

Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only: no application code, schema, legal text, DPIA, `docs/build-register.md` or Build Plan docx was changed. Written for the backend and `apps/admin` agents who will build this.

**Decision Log #458 is not on `origin/main` yet** (it is being recorded by a docs PR in the same batch). The behaviour below is taken from the brief, not from the Decision Log text, and **no API route, field or response was read or verified**. Section 3 says what each frame needs; the names are for the backend PR.

## 1. What was built

10 frames (1440 wide, desktop, light mode, 1,184 high), a section title, a description and 6 Notes, in a clear band below the previous pass (title at y 149,000; row 1 at y 149,600; row 2 at y 151,400; notes at y 152,900). Nothing existing was edited, archived or deleted.

All frames are the **Admin user detail page of a minor with a confirmed guardian** (sample name Tolu Adeyemi, `example.com` address, all sample data). Layout follows `apps/admin` `UserDetailPage.tsx` (title, status pill, Back to users, Account card, Support actions card) and the F2 card style of the Edit admin frames (`6907:34127`). Built by cloning the Edit admin frame, so the Admin Shell set `6014:12948` (Active = Users), the F2 `Button`, `Pill`, `Callout`, `Banner` and `Note` components, the local dialog frame of `6879:31567` and the restricted dialog of `6879:31640` are reused. No new colours or variables.

The page frames add two things that the built `UserDetailPage` does not show today and that the summary endpoint may not return: an **Age group** fact ("Under 18") and a **Guardian** fact ("Confirmed" / "None confirmed"). They are drawn because the section only exists for a minor and its text depends on whether a guardian is confirmed. Founder / backend to confirm they are available.

## 2. Node ids

| # | Frame | Node id | Brief item |
| --- | --- | --- | --- |
| 1 | Guardian notices OFF | `6920:34766` | 1 |
| 2 | Set dialog | `6921:34878` | 2 |
| 3 | Set dialog, reason required (empty reason error) | `6921:35065` | 2 |
| 4 | Guardian notices ON | `6921:35255` | 3 |
| 5 | ON with Review due marker | `6921:35449` | 4 |
| 6 | Record review dialog (over frame 5) | `6921:35655` | 4 |
| 7 | Clear dialog (over frame 4) | `6921:35894` | 5 |
| 8 | Cleared, done (Info banner; section back to OFF) | `6921:36121` | 5 |
| 9 | Minor with no confirmed guardian | `6921:36281` | 6 |
| 10 | Restricted (admin not vetted, stale page) | `6921:36445` | 7 |

Frame names start `Admin — User detail (minor) — <n> …`. The section card in each is `Card — Guardian notices`; dialogs are `Dialog — <title>` over a `Scrim` (token `color/overlay/scrim`).

Section title `6922:35918`, description `6922:35919`. Notes (F2 `Note` instances, y 152,900): unvetted staff see nothing `6922:35920` (Scope open), adult accounts `6922:35923` (Scope open, brief item 8), review due and no automatic expiry `6922:35926` (Scope open), no confirmed guardian `6922:35929` (Scope open), copy pending legal review `6922:35932` (Copy pending), API drivers `6922:35935` (Decision candidate).

Key layers inside the section card: chip `Copy Tag [COPY PENDING LEGAL REVIEW]`, `Heading row` (title + pills), `Callout — …`, `Facts — withhold record`, `Fact — Reason (sample)`, `Actions` (ON states), `Button — Withhold guardian notices` (OFF states).

## 3. Frame to behaviour

| Frame | Shows | Behaviour or API that drives it |
| --- | --- | --- |
| Section visible at all | The card exists only for an admin who is child-safety-vetted AND an account that is a minor | Needs the viewer's vetting status and `isMinor` on the user summary. For other staff and for adults nothing is drawn (Notes). The vetting check must be a fresh read, as `assertAdminChildSafetyVetted` already is for reports. |
| 1 OFF | "Sending normally" pill, explanation, "Withhold guardian notices" | Flag is off. The button opens frame 2. |
| 2 Set dialog | Reason field (required), what switching on does, Cancel / "Withhold notices" | A "set" action with a required reason; logged. The three bullets state the decision: notices skipped silently, guardian-assisted two-factor recovery off (the child is pointed to Contact us and staff help them), consent emails unaffected. |
| 3 Empty reason | Alert border + "A reason is required." | Client-side check, and the server must also refuse a blank reason. The reason length range is not decided (10 to 500 is the range used for holds, not drawn here). |
| 4 ON | "Withholding" pill, Alert callout, Set by, Set on, Last reviewed, Reason, "Record review", "Clear" | Flag is on; needs who set it, when, the reason and the last review. The reason is shown to vetted admins only (label says so). |
| 5 ON, review due | Adds a "Review due" outline pill and an Info callout | Derived: on for more than 30 days. No automatic expiry. The basis of the 30 days (set time or last review) is not stated; drawn as the later of the two (assumed, Note `6922:35926`). |
| 6 Record review | Note field (required), "Record review" | A "review" action with a required note; logged; resets the review-due marker. |
| 7 Clear | Reason (required); "Notices that were skipped while this was on will not be sent." | A "clear" action with a required reason; logged. Skipped notices are not sent afterwards. |
| 8 Done | Info banner "Guardian notices cleared"; section back to OFF | Success state of frame 7. Success banners for set and review are not drawn (not asked); the same banner pattern would apply. |
| 9 No confirmed guardian | Hint "…no effect until one is confirmed. You can still switch it on."; pill "No guardian to notify" | The flag can be set with no confirmed guardian. Needs the guardian state on the summary. |
| 10 Restricted | Existing "Restricted — child-safety vetting required" callout in a dialog titled "Withhold guardian notices" | An action sent by a page that was loaded when the admin was vetted and is not now. Same pattern and wording as the Escalate dialog `6879:31599`. |

Recovery switch (guardian-assisted two-factor recovery off) is a separate system effect; the frames only describe it in text. Nothing is drawn for what the minor or the guardian sees, because they see nothing.

## 4. Wording tagged for counsel

Every new string carries the frame-level convention: a `[COPY PENDING LEGAL REVIEW]` chip on each card, and the same tag inline in each dialog and in the banner. The tag does not hold the build. New strings:

- Card: "Guardian notices", "Sending normally", "No guardian to notify", "Withholding", "Review due", "Only child-safety-vetted staff can see this section. The child and their guardian never see it, and other staff see nothing in its place.", "Guardian security and safety notices for this account are sent as normal.", "While this is on, those notices are skipped silently and guardian-assisted two-factor recovery is switched off. A written reason is required.", "Withhold guardian notices", "Guardian notices are being withheld" with "Guardian security and safety-action notices for this account are skipped silently. Guardian-assisted two-factor recovery is off: the child is pointed to Contact us and staff help them. Consent emails are not affected.", "This has been on for more than 30 days. Record a review, or clear it if it is no longer needed.", "Set by", "Set on", "Last reviewed", "Never", "Reason (visible to child-safety-vetted admins only)", "Record review", "Clear", "This account has no confirmed guardian yet, so withholding has no effect until one is confirmed. You can still switch it on."
- Set dialog: "Withhold guardian notices?", the intro and three bullets (frame 2), "Reason (required)", "Say why guardian notices should be withheld for this account.", "Withhold notices", "A reason is required."
- Record review dialog: "Record a review", "Confirm that withholding guardian notices for Tolu Adeyemi should continue. Your note is saved to the audit record.", "Note (required)", "Say why this should continue.", "Record review".
- Clear dialog: "Clear guardian-notice withholding?", "Guardian notices for Tolu Adeyemi will be sent as normal from now on. Notices that were skipped while this was on will not be sent.", "Reason (required)", "Say why guardian notices can be sent again.", "Clear".
- Banner: "Guardian notices cleared", "Guardian notices for Tolu Adeyemi are sent as normal again. Notices skipped while this was on will not be sent. The action was recorded."

Reused, not new: "The reason is saved to the audit record." (already tagged elsewhere) and the restricted callout wording in frame 10 (existing, untagged). The sample reason "Safeguarding concern about the home. Staff are supporting the child directly." is sample content only and is named so in the layer.

The Account card's new facts (Age group, Guardian) and the sample names are not tagged. The frontend agent should add `docs/pending-copy-manifest.md` rows when coding.

## 5. Not drawn, undecided

1. **Decision Log #458 and the API are not on `main`**: no route, field or error code was checked. The "Decision candidate" Note `6922:35935` says so.
2. **Basis of the 30-day review marker** (set time or last review) is assumed to be the later of the two. Founder to confirm.
3. **Reason and note length rules** are not decided and not drawn beyond "required".
4. **Review history**: only the latest "Last reviewed" is shown. No list of past sets, clears or reviews (they are logged, but no screen reads the log).
5. **Set by** shows a name; whether to show a name or an id is not decided.
6. **Success banners for set and review** are not drawn (only clear, as asked). Load and error states for the section, a second admin changing the flag first (a stale-page conflict), and the guardian being replaced or removed while the flag is on are not drawn. Note `6922:35929` records the last one.
7. **Clear and Withhold are Secondary buttons**: the F2 set has no destructive variant and no destructive token exists (non-negotiable 3), so none is drawn.
8. **Dialog bullets** are one text block with "•" characters, not a list component (the file has none).
9. **Mobile** was not drawn (Admin Console is desktop only).
10. **What the account detail endpoint exposes** for Age group and Guardian (section 1) is unverified.
11. **When the account turns 18** the section is absent; what happens to the flag and to skipped notices is not stated. Note `6922:35923`.

## 6. Self-checks

Standing check (Decision Log #404 item 14), by a node walk, not a whole-page metadata pull:

- Top-level nodes on page `0:1`: **1,151 to 1,169** (10 frames, a title, a description, 6 Notes). Hash of the first 1,151 ids (djb2-style, `h*33 xor char`, ids in page order) **unchanged: 2,984,854,159** before and after. This hash function is mine; earlier reports used their own, so values are not comparable across reports. No node deleted, archived or edited.
- Paints: solid fills and strokes on authored nodes (outside the Admin Shell instances) counted per frame, **0 unbound** (frames 49 to 83 solids each; Notes 4 each). The nodes inside each `Admin Shell` instance (98 per frame) were skipped, not audited: they are the shell's own and carry the inherited `Rectangle 223` literal (Decision Log #199). Alert red is used only as a field border, a 3 px bar and a callout bar (non-text), and its paint is bound to `semantic/alert`.
- Overlaps: 0 against every other top-level node.
- Node names: no default names on authored nodes (20 generic `Text` frames in the Support actions rows were found by the audit and renamed to `Label and description — …`). Names inside the shell instances were not renamed.
- Fonts: all authored text is Inter (Admin text styles via cloned text nodes); instance text not checked.
- Frame size: 1,440 x 1,184 on all ten (the content never exceeded the 1,184 floor).
- Contrast: not recomputed. Every pair is an existing F2 pair (Pill Strong white on navy, Outline navy on white, Callout Alert and Info, secondary text on white) already measured in the Admin two-factor reports. The error line "A reason is required." is navy text beside a red bar, not red text.
- Visual checks (screenshots read): frames 1, 2, 3, 5, 7, 8, 9, 10 and one Note. Frames 4 and 6 were not read in isolation: frame 4 is frame 5 without the review-due elements, and frame 6 is the record-review dialog on frame 5, with the same structure as frame 7.
- Not verified: a real rendering in `apps/admin` (nothing is coded); no API.
