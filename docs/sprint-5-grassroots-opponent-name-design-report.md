# Sprint 5 — Grassroots free-text opponent name (Figma design half of Decision Log #256)

**Agent:** `figma-design-system` · **Date:** 2026-09-08 · **Scope:** Figma design only — no
`apps/*` / `services/api` code touched. **No Bash available this session** — the branch, commit,
Build Plan docx Decision Log transcription, `CLAUDE.md` "Where things stand" bullet and the PR are
deferred to a follow-up session with shell access, the same pattern used for PRs #98 / #102 / #110 /
#130 / #151. Not merged.

Pairs with the **backend half**, `sprint-5/grassroots-opponent-name` (backend-api, PR #215,
Decision Log **#260**), which added `Fixture.opponentName String?` (nullable). This pass wires that
into the two Figma frames that capture the away opponent and the one frame that renders it.

---

## 0. Preconditions verified live

- **File / page.** `figma.root.name` reads back as `"Document"` (an unsaved local title in the
  desktop app), **not** `"Soccernity-MVP"`. This is a cosmetic local-state quirk, not the wrong
  file: every Grassroots node ID and frame name matched
  `docs/sprint-5-grassroots-record-keeping-screens-report.md` exactly (frame 4 desktop
  `6371:16908`, mobile `6376:17711`, frame 9 `6373:17444` / `6379:17751`, Design Notes
  `6380:17791`, all 20 screen frames present with matching x/y), and the `Soccernity Theme`
  collection (`VariableCollectionId:5096:2`, 14 COLOR variables, Light default) is present and
  intact. Work proceeded on page `0:1`.
- **Decision Log high-water mark.** The current highest entry is **#260**
  (`sprint-5/grassroots-opponent-name`, per `CLAUDE.md` line ~7548). The new candidate below is
  therefore **#261** — the numbering the task anticipated held.
- **Backend contract** (from `services/api/src/modules/grassroots/README.md`, "Free-text opponent
  name"): the away side of a fixture is **exactly one of three states** — `teamBId` (registered
  team) XOR `opponentName` (free-text, e.g. "Riverside FC"), or neither. Both supplied → `400`. The
  API returns the raw `opponentName: string | null`; **the "Opponent TBC" display fallback when
  both are absent is a frontend concern** and is not returned by the API.

---

## 1. Sweep — where "Opponent TBC" / the outlined `?` tile actually renders

All **20 screen frames + the Design Notes frame** were scanned node-by-node for the literal string
`Opponent TBC`, `TBD`, "to be confirmed", and for `Monogram — TBC` / `?` placeholder tiles.

| Frame | Contains "Opponent TBC" / `?` tile? | Handling |
|---|---|---|
| **4 Schedule Fixture (Opponent TBD)** — D `6371:16908`, M `6376:17711` | The **input callout** copy ("The fixture will show 'Opponent TBC'") and the "Opponent to be confirmed" checkbox — this is the capture screen | **Edited** — added the name field, reworded the callout/checkbox/annotation (§2) |
| **9 Public Team Page (Verified)** — D `6373:17444`, M `6379:17751` | **Yes** — fixture row 2: `Monogram — TBC` (`?` tile) + text "v  Opponent TBC" + a schema annotation | **Edited** — text → "v  Riverside FC", `?` tile **kept**, row/monogram renamed, annotation reworded (§3) |
| **3 Schedule Fixture** — D `6369:16675`, M `6376:17631` | Has an "Opponent to be confirmed" affordance (clone **source** for the new field) | **Not touched** — this is the pick-a-registered-team happy path and the clone source; out of scope |
| **5 Fixture Scheduled** — D `6368:16610`, M `6377:17671` | **No** — depicts the *registered* opponent "Ikorodu Rangers" (monogram "I") | **Not touched** — different fixture example, no TBC/`?` present |
| **6 Fixture Manage (Scheduled)** — D `6372:17141`, M `6377:17724` | **No** — "Ikorodu Rangers", registered | **Not touched** |
| **7 Log Result (Live)** — D `6372:17259`, M `6378:17711` | **No** — "Ikorodu Rangers", registered | **Not touched** |
| **8 Result Confirmed (Full Time)** — D `6373:17321`, M `6378:17776` | **No** — "Ikorodu Rangers", registered | **Not touched** |
| **10 Public Team Page (No Fixtures, Unverified)** — D `6374:17501`, M `6379:17868` | **No** — "Marina Boys FC", **empty state**, zero fixture rows | **Not touched** |
| **1 / 2 (Register Team / Team Registered)** — D+M | **No** | **Not touched** |
| **Design Notes** `6380:17791` | Yes — FLAG 2, DL #256 candidate, schema-mapping row, flow-map line | **Edited** (§4) |

**Result:** frames **5, 6, 7, 8 and 10 (desktop + mobile) genuinely have no "Opponent TBC" and no
`?` tile** — they each depict a single concrete fixture against a *registered* team (Ikorodu
Rangers), or an empty team page (Marina Boys FC). Forcing a "Riverside FC" label onto them would
mean fabricating a different fixture than the one they were built to show. They are deliberately
left unchanged. Only frame 9 D+M carries the free-text-opponent case downstream.

---

## 2. Frame 4 — "Schedule Fixture (Opponent TBD)", desktop `6371:16908` + mobile `6376:17711`

Additive field + copy rewording. **Frame not renamed, flow not restructured.** Both frames are
fully vertical auto-layout that hugs its content (`primaryAxisSizingMode: AUTO`,
`layoutSizingVertical: HUG`), so inserting the field reflowed the card / content / frame cleanly —
the frame simply grew taller, keeping its bottom padding (desktop 90 → frame **1564 → 1680**;
mobile 56 → frame **1180 → 1370**).

### The new field — cloned, not re-authored

| | Desktop | Mobile |
|---|---|---|
| Cloned from | `Field — Venue (optional)` on **`Grassroots — 3 Schedule Fixture — Desktop`** (`6369:16966`) | `Field — Venue (optional)` on **`Grassroots — 3 Schedule Fixture — Mobile`** (`6376:17703`) |
| New frame ID | `6389:17791` `Field — Opponent name (optional)` | `6389:17795` `Field — Opponent name (optional)` |
| Label node (was "Venue (optional)") | `6389:17792` → **"Opponent name (optional)"** | `6389:17796` → **"Opponent name (optional)"** |
| Input frame | `6389:17793` | `6389:17797` |
| Placeholder node (was "e.g. Teslim Balogun Stadium") | `6389:17794` → **"e.g. Riverside FC"** | `6389:17798` → **"e.g. Riverside FC"** |
| Placed | Child **index 1** of `Field — Opponent (teamB)` `6371:16926` — directly under the "Opponent" group label, above the "Opponent to be confirmed" checkbox | Child **index 1** of `Field — Opponent (teamB)` `6376:17729` |

The clone inherits every variable binding: label `color/text/primary` (`5096:8`), input fill
`brand/green-tint` 12% (`5096:5`), placeholder `color/text/secondary` (`5096:9`), 8px corner
radius. It was set to `layoutSizingHorizontal: FILL` (→ full field width) and
`primaryAxisSizingMode: AUTO` / `layoutSizingVertical: HUG` (the Venue source had filled its
horizontal parent's height, which collapsed to 1px in a vertical parent until corrected).

**Depiction:** the field shows the **muted placeholder "e.g. Riverside FC"** (not a filled value),
and the "Opponent to be confirmed" checkbox is left **checked and untouched** — so the frame stays
a coherent single example of the unregistered-opponent path: *"opponent isn't a registered team;
optionally type their name here."* The task permits placeholder or sample value; placeholder keeps
the frame's own name ("Opponent TBD") accurate with zero contradiction.

### Reworded copy (no node removed)

| Node | Frame | Before | After |
|---|---|---|---|
| `6371:17210` | 4 D — callout heading | "The fixture will show "Opponent TBC"" | **"How this shows on your team page"** |
| `6371:17211` | 4 D — callout body | "Your team page will list this fixture with the opponent left open…" | "With a name, the fixture lists that opponent — no crest, since they are not a registered team. **Leave the name blank and it shows as "Opponent TBC" until you add one.** You can attach a registered team any time before kick-off, and can still start the match and log a result without an opponent." |
| `6371:16954` | 4 D — checkbox sub-helper | "Use this when the other side is not on Soccernity yet." | "The opponent is not a registered Soccernity team. Add their name above, or leave it blank to show "Opponent TBC"." |
| `6371:16955` | 4 D — schema annotation | "…there is NO free-text opponent-name field… would require a schema addition (e.g. Fixture.opponentName String?)" | "[SCHEMA] Away side = Fixture.teamBId XOR Fixture.opponentName (free-text, e.g. "Riverside FC"), or neither → "Opponent TBC". opponentName String? (nullable) added in Decision Log #260 / PR #215; this optional field captures it. Supplying both is a 400. The "Opponent TBC" fallback when both are absent is a frontend display rule (Decision Log #261)." |
| `6376:17793` | 4 M — callout heading | "Shows as "Opponent TBC"" | **"How this shows on your team page"** |
| `6376:17794` | 4 M — callout body | "You can attach a registered team any time before kick-off, and still log a result without one." | "With a name it lists that opponent, no crest — they are not a registered team. **Blank shows as "Opponent TBC" until you add one.** You can attach a registered team any time before kick-off, and still log a result without one." |
| `6376:17751` | 4 M — checkbox sub-helper | "The other side is not on Soccernity yet." | "Not a registered Soccernity team. Add their name above, or leave it blank to show "Opponent TBC"." |
| `6376:17752` | 4 M — schema annotation | "…there is NO free-text opponent-name field…" | "[SCHEMA] Away side = teamBId XOR Fixture.opponentName (free-text), or neither → "Opponent TBC". opponentName String? added by Decision Log #260 (PR #215); supplying both is a 400. The "Opponent TBC" fallback is a frontend display rule (Decision Log #261)." |

---

## 3. Frame 9 — "Public Team Page (Verified)", desktop `6373:17444` + mobile `6379:17751`

This is the only downstream frame that renders the free-text-opponent fixture. The `?` monogram
tile is **kept** — an unregistered opponent has no crest — and paired with the real name.

| Node | Frame | Change |
|---|---|---|
| `6373:17576` | 9 D — opponent text | "v  Opponent TBC" → **"v  Riverside FC"** |
| `6373:17568` | 9 D — row frame | renamed "Fixture Row — Opponent TBC" → **"Fixture Row — Riverside FC (opponentName)"** |
| `6373:17573` | 9 D — monogram frame | renamed "Monogram — TBC" → **"Monogram — no crest"** (the `?` glyph `6373:17574` unchanged) |
| `6373:17593` | 9 D — schema annotation | → "[SCHEMA] Row 2 has Fixture.opponentName = "Riverside FC" with teamBId null — a free-text opponent, shown with the typed name and an outlined "?" tile (no crest, since it is not a registered team). When opponentName is also blank the frontend substitutes "Opponent TBC" (Decision Log #260 / #261). GET /teams/:id/fixtures, sorted by Fixture.scheduledAt." |
| `6379:17813` | 9 M — opponent text | "v  Opponent TBC" → **"v  Riverside FC"** |
| `6379:17804` | 9 M — row frame | renamed → **"Fixture Row — Riverside FC (opponentName)"** |
| `6379:17810` | 9 M — monogram frame | renamed → **"Monogram — no crest"** (`?` glyph `6379:17811` unchanged) |
| `6379:17827` | 9 M — schema annotation | → "[SCHEMA] Row 2 has Fixture.opponentName = "Riverside FC" (teamBId null) — a free-text opponent, shown with the name and an outlined "?" tile (no crest). Blank opponentName → the frontend shows "Opponent TBC" (Decision Log #260 / #261). GET /teams/:id/fixtures." |

Frame 9 auto-hugs, so the slightly longer annotations reflowed cleanly (desktop **1126 → 1142**,
mobile **1062 → 1107**). The frame is still named "…(Verified)" and still shows three upcoming
fixtures + three results — only row 2's opponent identity changed.

**"Opponent TBC" is deliberately still reachable in the file:** frame 4's own callout, checkbox
helper, and the reworded annotations all describe the blank-name path, and the Design Notes frame
documents it as the neither-set fallback. No frame now *demonstrates* the fully-blank state, which
matches the founder decision that a typed name is the common path.

---

## 4. Design Notes frame `6380:17791` (h 3945 → 4094)

| Node | Change |
|---|---|
| `6380:17885` | schema-mapping label "teamBId  (nullable)" → **"teamBId / opponentName"** |
| `6380:17886` | mapping body → "Registered opponent → teamBId. Unregistered opponent → free-text Fixture.opponentName (frame 4, e.g. "Riverside FC"). Exactly one of the two, or neither. Neither → the frontend shows "Opponent TBC"." |
| `6380:17853` | flow-map line → "Schedule Fixture → (opponent branch: pick a registered team OR name a free-text opponent OR leave it open) → Fixture Scheduled" |
| `6381:17799` | FLAG 2 title → **"FLAG 2 — Free-text opponent name  (RESOLVED — Decision Log #260)"** |
| `6381:17800` | FLAG 2 body → "RESOLVED. The backend added Fixture.opponentName String? (nullable) in Decision Log #260 / PR #215. The away side is now exactly one of: teamBId (a registered team) XOR opponentName (free-text, e.g. "Riverside FC"), or neither. Supplying both is a 400. Frame 4 (D+M) captures the optional name; frame 9 (D+M) renders it with an outlined "?" tile — no crest, since the opponent is not a registered team. When both are absent the frontend substitutes "Opponent TBC" — a display fallback, never a stored string (Decision Log #261)." |
| `6381:17859` | DL candidate title → **"#256 — Free-text opponent name (FLAG 2) — RESOLVED"** |
| `6381:17860` | DL candidate body → "RESOLVED. Backend: Fixture.opponentName String? added (Decision Log #260, PR #215). Design: frame 4 D+M capture it, frame 9 D+M render it. Contract: teamBId XOR opponentName, or neither → "Opponent TBC" (a frontend display rule, Decision Log #261). #256 flips to fully Resolved." |
| **NEW `6389:17799`** | new Decision Log candidate row, cloned from the #258 row frame (`6381:17864`) and appended to the "Decision Log candidates" list (`6381:17848`). Title `6389:17800` = **"#261 — "Opponent TBC" display fallback is a frontend rule"**; body `6389:17801` = "opponentName present → show the typed name. Both teamB and opponentName absent → the frontend substitutes "Opponent TBC". The API returns the raw opponentName (string \| null) only and never the fallback string (services/api/src/modules/grassroots/README.md). Resolves the design half of #256; figma-to-code owns the fallback." |

---

## 5. Paint audit

Authored / cloned nodes only (11 nodes — 2 field clones × {frame, label, input, placeholder} + 1
Design Notes row × {frame, title, body}):

| | Bound | Unbound | Off-palette | `brand/green-tint-28` |
|---|---|---|---|---|
| **Authored / cloned** | **8** | **0** | **0** | **0** |

- Tokens used, all Light mode: `color/text/primary` (`5096:8`), `color/text/secondary` (`5096:9`),
  `brand/green-tint` 12% (`5096:5`). No new colour. No `brand/green-tint-28`. Type is Inter
  throughout, matching the existing Grassroots chrome.
- **0 frame overlaps** — a full AABB test of the 5 touched frames (4 D+M, 9 D+M, Design Notes)
  against every top-level child on page `0:1` returned zero clashes, including none among the
  grown frames and their row neighbours.
- **Inherited component-instance debt, unchanged and stated separately:** the `header 4` /
  `header 4 — mobile` navbar instances on frames 4 and 9 each carry the shared-component avatar
  `IMAGE` fill, which is not editable from an instance and was **not** force-bound — identical to
  the residual the original Grassroots design report (§3) already disclosed. No calendar instances
  were touched (the calendar sits below the opponent field on frame 4 desktop; its 4 `opacity: 0`
  adjacent-month numerals remain the pre-existing Decision Log #53/#178 debt).

---

## 6. Screenshot verification

- **Frame 4 desktop** (full frame) — the "Opponent name (optional)" field renders between the
  "Opponent" group label and the checkbox, green-tint input, muted "e.g. Riverside FC" placeholder;
  reworded callout and annotation legible, no clipping; frame grew to 1680 with its 90px bottom
  margin intact.
- **Frame 4 mobile** (full frame) — same, at 350px column width; frame grew to 1370 with 56px
  bottom padding intact; callout wraps cleanly.
- **Frame 9 desktop + mobile** ("Upcoming fixtures" section) — row 2 shows the outlined `?` tile
  next to "v  Riverside FC" and "Agege Stadium"; SCHEDULED pill unchanged; reworded annotation
  wraps without clipping.
- **Design Notes** — FLAG 2 block, the schema-mapping row, and the full "Decision Log candidates"
  list (now #253–#258 + #261) all render with no clipping; the new #261 row matches the styling of
  the others exactly.

---

## 7. Frames touched — complete list (nothing beyond the task's named set)

- **Frame 4** — desktop `6371:16908`, mobile `6376:17711` *(named)*
- **Frame 9** — desktop `6373:17444`, mobile `6379:17751` *(named)*
- **Design Notes** `6380:17791` *(task section 3 — its explicit target)*

**Frames 6, 7, 8, 10 (all named in the task) were checked node-by-node and NOT modified** — they
depict a registered-opponent fixture (Ikorodu Rangers) or an empty team page (Marina Boys FC) and
contain no "Opponent TBC" string or `?` tile. **Frame 5 (also checked per the task) — not
modified**, same reason. **No frame outside the set {4, 9, Design Notes} was touched.**

---

## 8. Decision Log — draft entry for the follow-up session to transcribe

Current highest entry in the live docx is **#260**. New entry is **#261**. If the docx has moved
past #260 by transcription time, renumber and say so.

**Ready-to-paste row (Build Plan Section 9, Table 6 — Candidate / Raised by / Status):**

| Column | Text |
|---|---|
| **#** | 261 |
| **Candidate** | "Opponent TBC" is a frontend display fallback, not backend data. `Fixture.opponentName` (added by #260) is captured on the Grassroots "Schedule Fixture (Opponent TBD)" frames (`6371:16908` / `6376:17711`, an optional "Opponent name (optional)" input) and rendered on the Public Team Page (`6373:17444` / `6379:17751`, the typed name beside an outlined "?" no-crest tile). The away side is `teamBId` XOR `opponentName`, or neither; when both are absent the frontend substitutes the literal string "Opponent TBC" — the API only ever returns the raw `opponentName: string \| null` (`services/api/src/modules/grassroots/README.md`). |
| **Raised by** | `sprint-5/grassroots-opponent-name` (design half) — `figma-design-system`, 2026-09-08 |
| **Status** | **Resolved (design).** Frames updated: 4 D+M (capture), 9 D+M (render), Design Notes (`6380:17791`). This completes the design half of **#256**, whose backend half was resolved by **#260**. **#256 should flip to fully Resolved** — append a forward-pointer to #256's own Status cell: *"Resolved — backend #260, design half #261."* `figma-to-code` owns implementing the "Opponent TBC" fallback (show `opponentName` when present; substitute "Opponent TBC" only when `teamBId` and `opponentName` are both null). |

**Also update #256's Status cell** (currently "Open — founder"): prepend `Resolved — ` and add the
forward-pointer to #260 (backend) and #261 (design).

---

## 9. CLAUDE.md — draft "Where things stand right now" bullet for the follow-up session

```markdown
- **`sprint-5/grassroots-opponent-name` — DESIGN HALF (figma-design-system, 2026-09-08) wires the
  free-text away-opponent name (`Fixture.opponentName`, added by the backend half / Decision Log
  #260) into the Grassroots Figma frames. Figma design only, no app/backend code. Decision Log
  #261; #256 now fully Resolved (backend #260 + design #261).** No Bash this session — branch,
  commit, docx transcription, this bullet and the PR were finalised in a follow-up session (same
  pattern as PRs #98/#102/#110/#130/#151). Report:
  `docs/sprint-5-grassroots-opponent-name-design-report.md`.
  - **Frame 4 "Schedule Fixture (Opponent TBD)" — D `6371:16908` + M `6376:17711`:** added an
    **"Opponent name (optional)"** text input (cloned from frame 3's `Field — Venue (optional)`,
    so every token binding is inherited), placeholder "e.g. Riverside FC", placed under the
    "Opponent" label above the existing "Opponent to be confirmed" checkbox. Frame **not** renamed,
    flow **not** restructured — additive field only. Callout, checkbox helper and schema annotation
    reworded to explain: leave the name blank and the fixture shows "Opponent TBC" until a name is
    added. Both frames auto-hug, so they just grew taller (1564→1680, 1180→1370).
  - **Frame 9 "Public Team Page (Verified)" — D `6373:17444` + M `6379:17751`:** fixture row 2's
    "v Opponent TBC" → **"v Riverside FC"**, the outlined `?` monogram tile **kept** (unregistered
    opponent, no crest), row/monogram frames + schema annotations renamed/reworded.
  - **Design Notes `6380:17791`:** FLAG 2 and the #256 candidate reworded to RESOLVED, the schema
    field→UI mapping row and flow-map line updated, and a new **#261** row added documenting that
    "Opponent TBC" is a frontend display fallback (the API returns raw `opponentName: string|null`).
  - **Frames 5, 6, 7, 8, 10 (D+M) checked node-by-node and left unchanged** — each depicts a
    registered-opponent fixture (Ikorodu Rangers) or an empty team page (Marina Boys FC); no
    "Opponent TBC" / `?` tile present. No frame outside {4, 9, Design Notes} was touched.
  - **Audit:** 8 authored solid paints, **all variable-bound, 0 unbound / 0 off-palette / 0
    `brand/green-tint-28` / 0 new colours**, Light mode only, **0 frame overlaps**. The navbar
    avatar `IMAGE` fill on the `header 4` instances is pre-existing shared-component debt, not
    force-bound.
  - **`figma-to-code` owns the fallback:** show `opponentName` when present; render the literal
    "Opponent TBC" only when both `teamBId` and `opponentName` are null.
  - Not merged — founder's call after review.
```

---

## 10. Handover / deferred (no Bash this session)

- Nothing committed, no branch created, no PR opened, `CLAUDE.md` and the Build Plan docx not
  edited — all deferred to a follow-up shell session. §8 and §9 give the exact text.
- The follow-up session must: create the branch, commit the Figma-change record (this report),
  transcribe Decision Log **#261** into Build Plan Section 9 Table 6, **flip #256 to Resolved**
  with a forward-pointer, add the §9 bullet to `CLAUDE.md` "Where things stand right now", and open
  the PR.
- **Not in scope / not done:** the `figma-to-code` conversion (Grassroots has no `apps/web`
  screens yet); a rename-the-opponent-of-an-existing-fixture flow (no `PATCH /fixtures/:id`
  endpoint — backend README flags this as a parked follow-up); Decision Log #257 (calendar
  component) and #258 (teams browse screen / nav entry point) — untouched, still open.
