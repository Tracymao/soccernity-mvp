# Figma pass T: tolerance stat on the three old Finalist impressions frames

Date: 2026-10-29. Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only. No application code, schema, legal copy, DPIA, `.docx` or `docs/build-register.md` touched.

**Result: no Figma change was needed, and none was made.** The brief expected a stat that still reads "Outside tolerance" as a value. Read live, it does not: on all three frames every stat value is already "—". The words "Outside tolerance" are a stat LABEL, and its value is "—". Nothing was edited, so the standing check is trivially clean.

## 1. Where the tolerance band appears (read live, before any change)

Frames: `6646:22745` (Pre-week-4, nine finalists), `6646:23097` (Fewer Than 9 Finalists), `6646:23984` (Settings Validation, 1440 x 1256). Every text node whose characters match /toler/i:

| Frame | Role | Node | Text |
|---|---|---|---|
| `6646:22745` | Stat label | `6646:22969` | Tolerance band |
| | Stat value | `6646:22970` | — |
| | Stat label | `6646:22972` | Outside tolerance |
| | Stat value | `6646:22973` | — |
| | Settings field label | `6646:23083` | Tolerance (required) |
| | Settings helper line | `6646:23087` | Finalist videos should stay within this percentage of the mean impressions across live finalist videos. |
| `6646:23097` | Stat label / value | `6646:23321` / `6646:23322` | Tolerance band / — |
| | Stat label / value | `6646:23324` / `6646:23325` | Outside tolerance / — |
| | Settings field label | `6646:23405` | Tolerance (required) |
| | Settings helper line | `6646:23409` | (same helper sentence) |
| `6646:23984` | Stat label / value | `6646:24211` / `6646:24212` | Tolerance band / — |
| | Stat label / value | `6646:24214` / `6646:24215` | Outside tolerance / — |
| | Settings field label | `6646:24325` | Tolerance (required) |
| | Settings helper line | `6646:24329` | (same helper sentence) |
| | Validation error | `6646:24332` | Tolerance is required. Enter a whole number. |

The four stats in `Summary` on each frame are Finalists (9 or 6), Mean impressions (—), Tolerance band (—), Outside tolerance (—). All stat text fills are variable-bound. The only pill text with tolerance wording is none: every status pill reads "No impressions yet" (pass S).

## 2. The stat value

Already "—", the same character the other pre-reveal stats use, in the existing `Stat` frame instances (`6646:22971`, `6646:23323`, `6646:24213`). Not changed. The earlier pass S report (section on stat cards, line 102) recorded exactly this; the brief's "still reads Tolerance band: Outside tolerance" is most likely the label of the fourth stat read as a value.

**Does the label imply a result?** "Outside tolerance" is a count label ("how many finalist videos are outside the tolerance band"). A count of "—" says it cannot be known yet, which is correct before the reveal. It does not itself state a result, so per the brief it is left as is. If the founder prefers a label that cannot be read as a finding (for example "Videos outside band"), that is a one-line text edit; I did not invent it.

## 3. The pills

Left as "No impressions yet" (nine on `6646:22745` and `6646:23984`, six on `6646:23097`). My view, for the founder: keep. They describe the same fact as the dashes ("Counting starts at the reveal") and are the only pill state that cannot contradict them.

## 4. Paint check, screenshots, node ids

- No node was changed, so no paint was added. All stat texts in the Summary are variable-bound. The Admin Shell instances (`6646:22746`, `6646:23098`, `6646:23985`) were not touched, so their one literal paint (`Rectangle 223`, Decision Log #199) is as pass S left it.
- Nodes changed: **none**. Top-level node ids: unchanged (nothing written, so no hash taken).
- Screenshots: `docs/figma-pass-t-screens/unchanged-6646-22745.png`, `unchanged-6646-23097.png`, `unchanged-6646-23984.png`. Because nothing changed there is no before and after pair; these show the state read live, with the four stats ending "—", "—", "—" after the Finalists count.

## 5. Legal or safety wording

No new or changed wording, so nothing to tag `[COPY PENDING LEGAL REVIEW]`.

## 6. Open points

1. **The "Tolerance band" stat shows "—", yet the settings card below shows the configured band (10 % of the mean).** The band is a setting, known before the reveal, so the stat could show it. The "—" is correct under the pass S rule that every impression-derived figure is a dash, but the band is not impression-derived. Founder call; not changed.
2. Label wording of the fourth stat (section 2).
3. The Summary caption "Counting starts at the reveal" sits below the stats row on `6646:22745`; on the other two frames it was not re-checked for position.

## 7. Status line for the next docs PR (not added here)

Suggested for `docs/build-register.md`, rows B-261 and B-240: "Figma pass T (2026-10-29): the three old Finalist impressions frames (`6646:22745`, `6646:23097`, `6646:23984`) checked live; the tolerance stat values were already '—' (pass S), the fourth stat's label 'Outside tolerance' is a count label and was left; no Figma change. Open: whether the Tolerance band stat should show the configured band."
