# CH-H17: Decision Log gaps closed

Docs only. Six numbers named in register "Updates" sections had no Decision Log row and no Section 7 row. Each row below was written from its source section only. No PR number was added to any row, because no section states its own.

## #574 (register Section 142)

- **Decision needed:** Admin shell restyled in Figma: the restyle values and the eight behaviour rules in the spec frame.
- **Raised in:** Adopted default, veto-able
- **Status:** Figma and docs only: the Admin Shell component set 6014:12948 restyled in place with existing colours and the new foundations; two frames added (component states 7204:71662, behaviour spec 7205:71662). Recorded from register Section 142.
- **Section 7 row:** `| #574 | none | Figma only (2026-11-26); admin shell restyled, adopted default veto-able, see Section 142 |`
- **Not stated by the source:** Does not say who raised it beyond "adopted default, veto-able". Does not give the restyle values or the eight rules themselves (they are in the Figma spec frame). No PR number.

## #575 (register Section 145)

- **Decision needed:** Admin shell restyle, code half. Visual only: nav rows (44px, hover, pressed, focus, active with a leading indicator), Log Out as a secondary button, Create as a primary button, and the search bar on a white surface with a 1px border; colours and the structure of every admin page are unchanged; adds a shared nav type step (15/20).
- **Raised in:** Recorded from register Section 145 (the section does not say who raised it)
- **Status:** Code, visual only. Not verified in a browser. Recorded from register Section 145.
- **Section 7 row:** `| #575 | none | Yes (2026-11-26); admin shell restyle, code half, visual only, not verified in a browser, see Section 145 |`
- **Not stated by the source:** **Does not say who raised it.** Does not say whether it is merged; Section 7 says "Yes" because the section describes code. No PR number. Says "Not verified in a browser".

## #577 (register Section 147)

- **Decision needed:** The shipped code is the truth for the group 1 admin list frames, so the Articles Cover column and the icon-only Users actions were removed from the Figma frames. A Cover thumbnail on the Articles list is not part of shipped admin and would be a separate decision.
- **Raised in:** Founder, 2026-11-26
- **Status:** Figma only, no code: Users, Articles, Categories and Add Category frames aligned to the code and restyled; new patterns frame 7230:71662. Not verified: the hover/pressed overlay fix has no screenshot afterwards. Recorded from register Section 147.
- **Section 7 row:** `| #577 | none | Figma only (2026-11-26); admin list frames (group 1) aligned to the shipped code and restyled, see Section 147 |`
- **Not stated by the source:** Says "Merge status of the PR is not recorded here". No PR number.

## #579 (register Section 149)

- **Decision needed:** Standing rule: the shipped code is the source of truth for Figma. Figma shows what the shipped admin renders.
- **Raised in:** Founder (standing rule), 2026-11-26
- **Status:** Figma and docs only: the Admin Shell aligned to the shipped code (part 1 of 2). Recorded from register Section 149.
- **Section 7 row:** `| #579 | none | Figma only (2026-11-26); shipped code is the source of truth for Figma, Admin Shell aligned (part 1 of 2), see Section 149 |`
- **Not stated by the source:** Does not say whether it is merged. No PR number of its own.

## #580 (register Section 150)

- **Decision needed:** The shipped code is the source of truth for Figma (standing); Delete is a secondary navy outline button, like View and Block, with no red anywhere.
- **Raised in:** Founder, 2026-11-26
- **Status:** Figma and docs only: the Users, Articles, Categories, Add Category and patterns frames follow the code (part 2 of 2). Recorded from register Section 150.
- **Section 7 row:** `| #580 | none | Figma only (2026-11-26); admin list frames aligned to the shipped code (part 2 of 2), see Section 150 |`
- **Not stated by the source:** Does not say whether it is merged. No PR number of its own.

## #582 (register Section 152)

- **Decision needed:** The admin body font moves from Montserrat to Inter; page titles and the wordmark stay Montserrat.
- **Raised in:** Founder, 2026-11-26
- **Status:** Code only: the Users, Articles, Categories and Add Category pages carry the premium restyle; no Figma, schema, API or copy change. Not checked in a browser. Recorded from register Section 152.
- **Section 7 row:** `| #582 | none | Yes (2026-11-26); admin list pages restyled and Inter for admin body text, code only, see Section 152 |`
- **Not stated by the source:** Does not say whether it is merged. No PR number of its own (the "#920 to #924" it cites is the earlier Figma alignment). Says "Not checked in a browser".

## Verification

- Decision Log table (python-docx against origin/main): 577 rows including the header, now 583. All existing rows are text-identical and in the same order. Other tables and body paragraphs are equal. `word/document.xml` is the only zip part that differs; zip test passes.
- Decision Log numbering: #1 to #584, no duplicates, no order breaks, gaps only #293 and #294 (gaps that predate this change, left alone). #367 to #584 has no gaps.
- Section 7: 218 rows, #367 to #584, each exactly once, no gaps. The one order break is the known #556 before #548, untouched.
- Register diff against origin/main (difflib, positional): the six Section 7 rows inserted, one sentence appended to line 3, and new Section 155. Nothing else.
- B-rows: 337 unique IDs on 500 lines, same before and after. Wave and "Register size" lines unchanged.
- No main-table B-row cites any of the six as a Decision Log number (the only text match, in B-267, is "PR #577", a GitHub PR).
- Not run: any code test (docs only). The docx was not opened in Word.

## Not changed

- `CLAUDE.md`: nothing in it describes these rows, so it was not updated.
- Section 153 still says #582 has no row; older sections are not edited, and Section 155 says it is out of date.
