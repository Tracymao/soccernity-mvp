# W0 Figma pass A — report

Branch `figma/w0-pass-a-resync`, 2026-10-15. Agent scope: `figma-design-system` (re-sync of existing frames only; no new screens). Figma file "Soccernity-MVP" (`weZWWqggy9j13eX8bhFgs6`), page `0:1`. Figma only: no application code, schema, legal copy or DPIA change, and no rewrite of an existing Decision Log row.

Source rows: `docs/build-register.md` B-001, B-002, B-003, B-004, B-005, B-008, B-009, B-011, B-014, B-105. Decisions applied: #60, #63, #365, #367, #368, #372, #373, #374 (superseded by #389 for explicit declines), #377, #378, #379, #389, #392 (item 4, corrected), #393.

## 1. Audit numbers

| Check | Result |
|---|---|
| Whole-canvas metadata (page `0:1`) before / after | 36,199 / 36,289 nodes. **0 nodes missing** after. 90 new nodes. |
| Existing nodes changed | Only inside the 21 frames listed below (306 node-level changes). 122 of them are in desktop Standing: 101 hidden FORM nodes plus 21 row groups whose bounding boxes were recomputed because hidden chips no longer count toward group bounds (no visible content moved). No other frame changed. |
| Deleted | **Nothing deleted.** Superseded content is hidden and renamed `ARCHIVED — …`. (The only `remove()` calls were on pieces of my own freshly cloned fields in B-004, never on an original node.) |
| Unbound fills / strokes on touched nodes | **0** across 107 audited nodes (every new node and every edited text node, plus all 37 notes). All new elements are clones of already-bound nodes. |
| Overlap check (touched frames + notes vs every other visible top-level node) | **0 new overlaps.** 3 hits (`5501:8584`, `1380:2318`, `1380:2297`) are against the pre-existing text bounding box of the "Email Template" section label (`1870:2744`, 7729×1878); the untouched frame `1380:2318` is flagged identically in the baseline. |
| Listed nodes still present | All 38 listed frame ids present in both pulls. |
| Screenshots | Every changed frame was rendered and looked at after its last edit (frames left unchanged: `5464:7077`, `5539:7314`, `5488:7164`, `5501:8225`, `5488:7248`, `5501:8342`, `1380:2318`, the two Account Info confirm frames, and the six Statistics frames, which only gained notes). |
| Variables | Light mode only; no new colour, no hex. New text uses existing text/fill bindings by clone. |

Baseline and after pulls (4.6 MB each) were diffed by node id; the diff script and outputs are in the session scratchpad, not committed.

## 2. Per B-ID

Notes (`NOTE — … (W0 pass A)`) are plain text nodes cloned from the existing caption-note style (`5933:10771`), placed above or below their frame. Their ids are listed per row.

### B-001 — Age Gate and Below-Minimum-Age
| Frame | Before → after | Change |
|---|---|---|
| `5108:6626` Age Gate desktop | 1440×900 → 1440×1062 | New mandatory "Country you live in" select (`6626:22212`) after the date of birth. Info panel, button and footer link reflow (Form is auto-layout). Right-panel content shifted +81 to stay centred. |
| `5539:7264` Age Gate mobile | 390×817 → 390×979 | Same field (`6626:22218`). |
| `5464:7077`, `5539:7314` Below minimum age | unchanged | No form on these states, so no field added. Two-colour denial treatment untouched. Note only. |

Option list, label, placeholder and hint are copied from the code: `COUNTRY_OPTIONS` = United States, United Kingdom, Nigeria, Another country (ISO `ZZ`, treated as non-US); label "Country you live in", placeholder "Select country", hint "Some countries ask for an extra check when a guardian approves an account for a younger child." (`GuardianDetailsStep.tsx`). The Guardian Details frames `5108:6627` / `5539:7354` were read-only sources and are not touched; they already match #393 (a): single full-name field, no country select.
Notes: `6626:22224`, `6626:22225`, `6626:22226`, `6626:22227`.

### B-002 — Restricted-pending, activation, web consent, approved, resent
| Frame | Change |
|---|---|
| `5108:6629` / `5531:7626` Web consent | Row "Build a player profile" hidden and renamed `ARCHIVED — … (#377)`. Stale "⚠ REFERENCE ONLY — no GET-by-consent-token endpoint" annotation (`5534:7284` / `5534:7285`) replaced by a status note (#372 decided, not yet built). Request-summary panel kept; added two notices (guardian email on profile as line of contact; photo and username visible) and a "Report incorrect details" action (#372), all tagged. "withdraw consent at any time by contacting us" replaced by a tagged placeholder. Frame heights 1788→1905 and 2197→2390. Logo group was scaled by the resize and restored to its original size and position. |
| `5108:6630` / `5531:7461` Restricted pending | Row "Set up your profile — Add your position and photo" hidden and renamed `ARCHIVED — … (#377)`. Added a tagged line under "What you can still do": registration cannot be completed until the guardian approves, including card verification where required (#367). |
| `5108:6631` / `5531:7544` Activation | Button "Go to my profile" → "Continue registration" (#367). Footnote no longer points at the archived Settings › Privacy & Safety; reads "Your guardian can review or withdraw consent at any time." |
| `5488:7164` / `5501:8225` Approved (guardian) | Unchanged: no criterion applies verbatim. Note only. |
| `5488:7248` / `5501:8342` Resent (minor) | Unchanged: no criterion applies verbatim ("valid for 3 days" matches the 72 h token). Note only. |

Notes: `6627:22220`–`6627:22229`. Created text nodes: `6627:22212`–`6627:22217` (web consent), `6627:22218`, `6627:22219` (restricted pending).

### B-003 — Consent Declined — Minor Notice (rewritten, not archived, per #389)
Frames `5491:8241` (1204→1258) and `5501:8453` (1592→1706). Existing "send a new request / change guardian email" actions kept (valid for declines 1–2 under #389). Added tagged notice `6627:22230` / `6627:22231`: a guardian can decline up to 3 times, changing the guardian email does not reset the count, after the third decline the account is scheduled for deletion. Notes: `6627:22232`, `6627:22233`.

### B-004 — Change Guardian Email
Frames `5498:7164` (856→1048) and `5501:8536` (927→1119). Added "Guardian's full name" (single field, #63) and "Their relationship to you" (select with chevron) in the coded order: current email, full name, new email, relationship. Placeholder wording read from the Guardian Details frame ("Parent or guardian’s name", "Select relationship"). Option list as coded: Parent, Legal Guardian, Grandparent, Other. The "restarts from scratch" notice panel is unchanged. New nodes: `6627:22234`, `6627:22239`, `6627:22244` (desktop), `6627:22245`, `6627:22250`, `6627:22255` (mobile). Notes: `6627:22256`, `6627:22257`.

### B-005 — Register
`407:1051` desktop 1770→1378, `1625:2333` mobile 1437→1091. Open date picker hidden and renamed `ARCHIVED — Date picker (open) — Date of Birth (#367)`. DOB field shows an auto-populated sample value `04 / 09 / 2011` with a tagged read-only hint (`6627:22258`, `6627:22259`). "Continue with Apple" hidden (`ARCHIVED — … (#378)`); Google and Facebook kept; content below moved up. Notes: `6628:22212`, `6628:22213`.

### B-008 — Login
`407:844` 1204→1136, `1625:2303` 965→905. Apple button hidden, sign-up link moved up. Notes: `6628:22214`, `6628:22215`.

### B-009 — Emails
`5108:6628` consent email: fallback link now `soccernity.app/guardian-consent/confirm?token=6f2a-91cd-4b70` (was `/consent/<id>`; host left as drawn). `5501:8584` minor-approval email: CTA label "Go to Soccernity" → "Continue registration" (#373); body unchanged. Notes: `6628:22216`, `6628:22217`.

### B-011 — Statistics / Standing
Verified live: the six Statistics frames (`640:3737`, `667:151`, `667:1511`, `5822:9075`, `5823:9108`, `5823:9317`) contain **no** FORM column, xG, rating or pressure-index element (full text inventory taken), so nothing was hidden there; note only. Standing `756:6433`: header `758:8308` and all 100 form chips hidden. Standing mobile `5821:9068`: header `6499:21059` and 14 form rows hidden. Not hidden: "Momentum" (computed from match events, not a vendor field) and the player box score (vendor supplies it). Notes: `6628:23265`–`6628:23272`.

### B-014 — Account Information
Confirm-password frames `2922:6396`, `5695:8213`: checked, carry no Username/Country field, no "no backend field yet" label and no DOB, so unchanged (note only). Edit frames: desktop `2924:7112` gains a read-only "Date of birth" field (`6628:23273`, hint `6628:23278`); mobile `5649:8176` loses the "(no backend field yet)" suffix on Username and Country (`5649:8189`, `5649:8201`), gains the DOB field (`6628:23279`, hint `6628:23283`) and its stale in-frame NOTE (`5649:8206`) is rewritten. Notes: `6628:23284`–`6628:23287`.

### B-105 — Password-change emails
`1380:2318` unchanged (confirmation after a reset completes). `1380:2297` renamed "Security alert email - suspicious password change"; title "Was this you?" → "Unusual password change"; body rewritten as a calm security alert; CTA "Reset your password" kept (it already targets the existing forgot-password page); no new link. The contact line keeps the `[security email]` placeholder already used in `1380:2318`, because no concrete support address appears in any email frame (the coded support address is in Decision Log #37). The frame grew 706→762; its children were restored after the resize scaled them. Note: `6628:22218`.

## 3. "[COPY PENDING LEGAL REVIEW]" tags added

| Where | Node ids | New wording |
|---|---|---|
| Web consent desktop / mobile | `6627:22212`–`6627:22214` / `6627:22215`–`6627:22217` | "Your email address appears on Ade's profile as their line of contact." · "Ade's photo and username are visible to other Soccernity members." · "Report incorrect details" |
| Web consent small print | `5113:6744` / `5531:7738` | "You can withdraw consent at any time. [… how to withdraw depends on the guardian withdrawal page, B-013.]" |
| Restricted pending | `6627:22218` / `6627:22219` | "Registration cannot be completed until your guardian approves, including card verification where required." |
| Declined minor notice | `6627:22230` / `6627:22231` | "A guardian can decline up to 3 times. Changing your guardian's email does not reset the count. After the third decline your account is scheduled for deletion." |
| Register DOB hint | `6627:22258` / `6627:22259` | "Set when you signed up and cannot be changed here." |
| Account Info DOB hint | `6628:23278` / `6628:23283` | same sentence |
| Security alert email body | `1380:2299` | "We noticed a password change on your Soccernity account that looked unusual. … Reset your password now, and contact us at [security email] …" (title "Unusual password change" is covered by the same tag) |

The already-present tags (consent statement, consent-email expiry panel) were left as they were.

## 4. "SCOPE OPEN" notes added (each is an on-canvas note, not a decision)

| Note | Open point |
|---|---|
| `6626:22224`, `6626:22225` | Age Gate heading/subheading still ask only for date of birth; wording for a combined DOB + country screen is not decided. |
| `6626:22226`, `6626:22227` | Whether DOB and country are kept or cleared on "Back to sign up" after a below-minimum denial. |
| `6627:22220`, `6627:22221` | Withdrawal wording and link depend on the guardian withdrawal page (B-013, not designed). The decline consequence sentence ("Declining keeps the account locked … after 30 days") is not rewritten; #389 changes what a first/second decline does and gives no wording. |
| `6627:22222`, `6627:22223` | No "declined" state is shown on the restricted-pending screen (B-076). |
| `6627:22224`, `6627:22225` | "You're all set" / "Everything that was switched off is now on" read as the end of the flow, while #367 continues to Create Profile. |
| `6627:22226`, `6627:22227` | "Ade's account is now active … They can sign in and use Soccernity" vs #367 (registration continues after approval). |
| `6627:22228`, `6627:22229` | What the minor sees after decline 1, 2 and 3, and whether the resent screen is reused after a decline, are not defined by #389. |
| `6627:22232`, `6627:22233` | Whether the screen shows "decline N of 3"; what the minor sees after the third decline (sessions are revoked, so no page can render; an email is not defined); no minor-facing state for the recipient's "don't contact me again" option or the requests-per-day cap. |
| `6628:22212`, `6628:22213` | How a read-only field is drawn is not defined in the design system; Google/Facebook sign-in must still pass the Age Gate (#378) and that flow is not drawn. |
| `6628:22217` | The approval email body says profile/DM/posting are "now switched on" while #367/#369/#370 continue to Create Profile and gate an incomplete profile. |
| `6628:22218` | Nothing in the backend defines or detects a "suspicious" password change, and whether sessions are revoked in that case is undefined; no send is wired. |
| `6628:23286`, `6628:23287` | Country is drawn like an editable field; #368 makes the IP-derived value authoritative and does not say whether the user can change it. |

## 5. Observed, not changed (outside the ten rows)

- Web consent mobile `5531:7626`: the "Date of birth given" value overflows its 262px row (pre-existing in the baseline).
- Change Guardian Email mobile `5501:8536`: the two action buttons render as thin 26px bars in a fixed 64px row (pre-existing).
- Restricted pending: "Follow teams, players and grassroots leagues" still names players (no player profiles exist, #377).
- Mobile Activation / Restricted-pending action buttons render as thin bars (pre-existing layout).
- The Guardian Details frames already match #393 (a), so B-075 is a code-only change.

## 6. Decision Log

**No Decision Log row added.** Every choice here follows a recorded decision; the points the decisions leave undefined are recorded as SCOPE OPEN notes above rather than decided.

## 7. Method note (for the next Figma pass)

Several of these frames are auto-layout inside an absolute-layout shell. Setting `y` on a child of an auto-layout frame is silently ignored, and `frame.resize()` on an absolute frame applies each child's constraints (a logo group with `SCALE` and an email frame with `SCALE` vertical constraints were scaled and had to be restored). Both were caught by re-reading geometry and by the whole-canvas diff, not by the first screenshot.
