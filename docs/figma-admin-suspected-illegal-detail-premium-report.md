# Figma: Suspected illegal imagery record detail (D1 to D14) restyled to the shipped code and the premium standard (2026-11-28)

Figma and docs only. No application code or CSS changed. Structure follows `SuspectedIllegalDetailPage.tsx`.

File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. The list frames L1 to L7 and the Media frames were not touched.

## Frames

Frame ids are unchanged. All are 1440 wide with the Admin Shell resized to the frame height. Page title at 301,129. New content at 301,258, 1098 wide, gap 20. Each old `Content` layer is renamed "ARCHIVED - Content", hidden and moved 40px below its frame. Nothing was deleted from the old layers.

| Frame | Id | New content | Height (was) | Archived layer | State |
| --- | --- | --- | --- | --- | --- |
| D1 | `7077:65267` | `7382:69782` | 1807 (1496) | `7077:65269` | Not filed, both forms empty |
| D2 | `7080:65413` | `7382:69930` | 1562 (1184) | `7080:65415` | Filed, "Recorded" callout, Decision card |
| D3 | `7080:65638` | `7382:70041` | 1400 (1184) | `7080:65640` | Decided not to file, "Recorded" callout |
| D4 | `7080:65854` | `7383:69666` | 1887 (1600) | `7080:65856` | Filed form errors |
| D5 | `7080:66073` | `7383:69838` | 1827 (1522) | `7080:66075` | Reason error |
| D6 | `7080:66259` | `7383:70007` | 1807 (1496) | `7080:66261` | Saving (filed form only) |
| D7 | `7080:66457` | `7383:70175` | 1863 (1584) | `7080:66459` | Save error |
| D8 | `7080:66657` | `7383:70348` | 1312 (1184) | `7080:66659` | Already decided (re-read record) |
| D9 | `7080:66877` | `7383:70445` | 1771 (1456) | `7080:66879` | No suggested body |
| D10 | `7080:67474` | `7383:70605` | 1184 | `7080:67476` | Loading |
| D11 | `7080:67649` | `7383:70610` | 1184 | `7080:67651` | Not found |
| D12 | `7080:67834` | `7383:70634` | 1184 | `7080:67836` | Load error |
| D13 | `7080:68021` | `7383:70660` | 1184 | `7080:68023` | Restricted (vetting) |
| D14 | `7080:68204` | `7383:70667` | 1184 | `7080:68206` | No access (role) |

The taller frames overlap nothing on the canvas, so no frame was moved.

## Removed tags

"[COPY PENDING LEGAL REVIEW]" was on 18 text layers: two on each of D1 to D9. All now sit only in the archived layers.

1. "These suggestions are pending counsel. None of them is approved or confirmed."
2. "A report to a receiving body must be made with that body, outside Soccernity. This page does not send anything. It only records that a report was made, or that it was decided not to make one."

The "Pending counsel" pill and the first sentence stay: they are code text.

## Texts changed, and old content the code does not render

| Frame | Old | Now | Why |
| --- | --- | --- | --- |
| D4 | "Enter a valid date and time." under an empty field | "The filing time cannot be in the future." under a sample value 12/01/2030, 09:00 AM | An empty date is allowed by the code |
| D4 | "Use at most 1000 characters." under an empty note | Same message, with placeholder text "(sample: a note longer than 1000 characters)" | See note 1 below |
| D5 | Reason "Not an image." (13 characters) with "Enter at least 10 characters." | Reason "Too short" (9 characters), same message | 13 characters passes the check |
| D7 | "Couldn’t save" title | Dropped | The code's error box is plain text |
| D8 | "Already decided" callout and its sentence | Dropped | A 409 only re-reads the record |
| D1 to D9 | Card titles in capitals | Sentence case | Code strings |

Other messages on D4 ("Choose a receiving body.", "Enter the reference you were given.") already matched. No frame shows "Name of the body": "Other" is not selected anywhere.

## Prototype links

Back links go to L1 `7074:64435` as before. "Record that this was filed" goes to D2 and "Record a decision not to file" to D3 on D1, D4, D5, D6, D7 and D9. On D6 the disabled "Saving…" button keeps the D2 link. D11 and D12 "Back to the list" had no link and still have none.

## Assumptions

- Sample record: `#3f9a1c2e`, Picture, flagged 16 Nov 2026 21:31, kept until 16 Nov 2027, country GB, not under 18, bodies IWF and NCA (the old frames' samples). D9 uses "Not known" and no bodies.
- Sample decision: 16 Nov 2026 22:05; filed at 21:58, reference IWF-2026-004417.
- Suggested bodies keep list bullets, as the code's `ul` does.
- The select chevron is the one on the restyled list frames.
- Default inputs have no stroke. This looks the same as the brief's 2px transparent border.
- The Field component was detached on every form field, because instance layers could not be resized to 44 and 80 high.
- The restricted and no-access cards are clones of L6 and L7, including their 1px navy border.

## Notes frame

`7080:68387`: three of eight notes updated (card titles and fields; select chevron; removed tags). The tags note `7080:68394` renders on white while its neighbours are green; only its text was edited. The other five are unchanged.

## Notes for the code PR

1. The note's "Use at most 1000 characters." cannot show in a browser: the textarea has `maxLength` 1000. "Enter a valid date and time." is also unlikely from a `datetime-local` input.
2. `.si-form` inputs have a 1px `--sn-icon-inactive` border on the surface colour. The frames use a 12% green fill, radius 8, no border, 44 high, and a 2px alert border when invalid.
3. `.si-field-error` is 12px regular; the frames use 12px Semi Bold.
4. The frames draw cards at radius 12 and callouts at radius 6 with 12/14 padding. The list report records the code at 10 and 8 with 14/16.

## Standing check

- Top-level count 2004. Id hash 2327422288.
- Queue content `5794:8710` 1100x620; Report Detail `5796:8635` Content 1098x1282; Appeal Review `5796:8753` Content 1098x1455.
- All 14 frames, outside the Admin Shell: no overlapping blocks, no overlapping top-level frames, no text under 12px, no uppercase labels, one search bar, no unbound solid fills, no tag.
- Contrast: 70% navy secondary text calculates at 5.0:1 on white and about 4.8:1 on off-white and green tint (token values assumed, not read from Figma). The disabled button on D6 is exempt.
- Screenshots reviewed for all 14, at 500 to 1000px, including D1 again after its field heights were fixed.
