# Register Section 7 coverage gaps, second pass (docs only)

Base: origin/main be334e7. Branch docs/register-section7-gaps-2. Only `docs/build-register.md` and this file changed. The Decision Log docx was read, not written.

## Rows added

| # | Referenced by | Evidence |
|---|---|---|
| 569 | none | Decision Log Status: "Decided by the founder, 2026-11-25, and built in services/api". Register Section 134 heading: "no new B-ID". No main-table row cites #569. |
| 570 | none | Status: "Built, awaiting founder verification", web only. Section 135 heading: "no new B-ID". No main-table row cites #570. |
| 572 | none | Status: "Built in Figma only (frame 7188:71447)". Section 139 heading: "no new B-ID". |
| 573 | none | Status: "Built, awaiting founder verification", code only, no visual change. Section 140 heading: "no new B-ID". |

Check script: Decision Log numbers from 367 up that lacked a Section 7 row were exactly 569, 570, 572 and 573 (as the brief said). I did not check commits 10ab642 and b2bc040 beyond the register text.

Also changed: Section 7 heading now "#367-#573"; one sentence appended to line 3; new Section 141 (the brief asked for the next free number: the last heading was 140, whose text sits in a bare-LF tail of the file, so I appended with an LF-safe approach and kept the CRLF body untouched).

## W9 paragraph discrepancy (not changed)

- Section 1 paragraph headed "B-IDs (58): B-073 ..." (line 449): header says 58, it actually lists 59 IDs (59 unique).
- Waves table (line 42): W9 = 63.
- Main table rows whose wave cell is W9: 63, matching the Waves table.
- IDs W9 in the main table but missing from the paragraph: B-327, B-329, B-330, B-331. The brief said B-326 to B-331; B-326 and B-328 are in fact listed in the paragraph.
- Every ID in the paragraph is a W9 row in the main table.
- Not determined: why the header says 58 while 59 are listed (likely a past B-ID added without bumping the count).
