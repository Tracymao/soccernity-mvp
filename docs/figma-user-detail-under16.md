# Figma: under-16 flag on the Admin User Detail page (B-172)

Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only: no application code, schema, legal copy, Build Plan docx or `docs/build-register.md`; no suite run.
Founder decision 2026-11-02 (Decision Log #462 item (e), register row B-172): the User Detail page shows the under-16 flag that `GET /admin/users/:id/summary` already returns (`isUnder16`). No backend change, no new date-of-birth exposure, the derived age tier stays out.

Written for: the `figma-to-code` agent that will add the flag to `apps/admin` `UserDetailPage.tsx`.

## What was read first

- `apps/admin/src/pages/users/UserDetailPage.tsx` (Account card, lines ~272-312): rows Display name, Username, Email, Status, Joined, Age group (`isMinor ? "Under 18" : "18 or over"`), Guardian, User ID.
- Figma frames: `6647:25540` User Detail, `6647:25789` Revoke Username Dialog, `6649:24462` Username Revoked, `6649:24714` Revoke Username Error, and the ten "Admin — User detail (minor)" frames drawn for Decision Log #458 (`6920:34766` ... `6921:36445`).
- Register row B-172 and its Section 70 note.

## What exists in Figma, and which frames show the Age group row

Two different Account-card patterns exist:

| Family | Frames | Card pattern | Shows Age group? |
|---|---|---|---|
| Original (B-012/B-104 host) | `6647:25540`, `6647:25789`, `6649:24462`, `6649:24714` | vertical label/value list: Display name, Username, Email, Status, Joined, User ID | **No** (drawn before B-282 added Age group and Guardian) |
| Guardian notices (#458) | ten frames `6920:34766`, `6921:34878`, `6921:35065`, `6921:35255`, `6921:35449`, `6921:35655`, `6921:35894`, `6921:36121`, `6921:36281`, `6921:36445` | horizontal "Facts" row of label-over-value columns, Display name, Username, Email, Joined, Age group, Guardian | **Yes** |

The brief says "every User Detail state that shows the Age group row", so the flag was added to the ten frames of the second family only. The four original frames were not touched (see SCOPE OPEN 1).

## What was drawn

1. **`Fact — Under 16`** added to the Facts row of all ten guardian-notice frames, directly after `Fact — Age group`: a clone of that Fact (same label and value text styles, same bound fills, same 4px spacing), label "Under 16", value "No". The ten frames all show a minor of 16 or 17, so the value is "No".

   | Frame | Node | New fact node |
   |---|---|---|
   | 1 Guardian notices OFF | `6920:34766` | `6950:40825` |
   | 2 Set dialog | `6921:34878` | `6950:40828` |
   | 3 Set dialog, reason required | `6921:35065` | `6950:40831` |
   | 4 Guardian notices ON | `6921:35255` | `6950:40834` |
   | 5 ON, review due | `6921:35449` | `6950:40837` |
   | 6 Record review dialog | `6921:35655` | `6950:40840` |
   | 7 Clear dialog | `6921:35894` | `6950:40843` |
   | 8 Cleared (done) | `6921:36121` | `6950:40846` |
   | 9 No confirmed guardian | `6921:36281` | `6950:40849` |
   | 10 Restricted (not vetted) | `6921:36445` | `6950:40852` |

2. **Three age-case frames** (new, 1440 x 1184, clear band at y 189000), so the three cases the data allows are each drawn once:

   | Case | Node | Age group | Under 16 | Guardian | Guardian notices card |
   |---|---|---|---|---|---|
   | A, 18 or over | `6950:40855` (Kemi Balogun) | 18 or over | No | None confirmed | absent (adult, as in #458) |
   | B, under 18 and 16 or over | `6950:41024` (Tolu Adeyemi) | Under 18 | No | Confirmed | OFF state |
   | C, under 16 | `6950:41191` (Dayo Okafor) | Under 18 | **Yes** | Confirmed | OFF state |

   Names, usernames and emails are samples.
3. **Four SCOPE OPEN notes** (instances of the existing `Kind=Scope open` note, y 190400): `6951:41181`, `6951:41184`, `6951:41187`, `6951:41190`.

## Decisions made

- **Row pattern kept.** The flag is one more label-over-value column, not a pill or an icon. A pill or emphasis for "Yes" was considered and not drawn: the row is plain data and every neighbour is plain text.
- **An adult shows "No", not nothing.** The row set then never changes with age (the server returns a boolean for every account, and the code shows Age group and Guardian for every account too). Hiding the fact for adults would make the card a different shape per case.
- **No wording about a date of birth, a tier or a rule.** Label "Under 16", value "Yes" or "No". Age group still reads "Under 18" or "18 or over" from `isMinor` only; "Under 16: Yes" always sits beside "Under 18".
- **No new string is tagged `[COPY PENDING LEGAL REVIEW]`**: the label and values are plain data and make no legal or safety promise (Decision Log #412 item 5).
- Admin components and tokens only: every new node is a clone of an already-bound node; nothing was hand-copied from outside the file.

## Standing check (Decision Log #404 item 14)

- Top-level nodes 1,250 to 1,257 (3 frames + 4 notes); hash of the original 1,250 ids unchanged (`258040532`, same function before and after).
- Paints on the three new frames: solid fills 107 / 120 / 120, bound 106 / 119 / 119; the single unbound paint on each is `Rectangle 223` inside the Admin Shell instance (inherited, Decision Log #199). The source frame `6920:34766` has the identical 120 / 119.
- Overlaps of every new frame and note against all top-level nodes: 0. Nothing deleted, nothing archived.
- Screenshots read for frames A (`6950:40855`), C (`6950:41191`), 9 (`6921:36281`) and the original frame 1: no clipping, the Facts row (widest case 938 px) fits the card.

## SCOPE OPEN

1. **The four original User Detail frames carry no flag, and no Age group / Guardian row.** They predate B-282. The code shows those rows for every account, so they are stale against the code. Re-syncing them (adding Age group, Guardian and Under 16) is a founder call; not done here because the brief is limited to frames that show the Age group row.
2. **The three cases are frames, not a variant property.** There is no User Detail component; the page is built from local frames. A Yes/No toggle on one frame was not built.
3. **Under-16 is not tied to the guardian-notice section in code.** The flag is drawn for every account; the code must render it from `isUnder16` in the summary, not from the guardian-notices visibility rule (which needs a vetted admin and a minor).
4. **Sample data only.** Names, handles and the 16 or 17 sample are illustrative; the page does not show a date of birth.
5. **The flag is stored, not recomputed.** `isUnder16` is a stored column recomputed by the daily age sweep (Decision Log #349), so a child who has just turned 16 can still read "Yes" for up to about a day. Not a Figma matter; noted so the build does not describe it as live.

## Follow-ups (not done, fixed nothing outside the brief)

- `figma-to-code`: add `Fact — Under 16` to the Account card in `apps/admin` `UserDetailPage.tsx` from `isUnder16`; test the three cases.
- Figma: re-sync the four original User Detail frames (SCOPE OPEN 1) if the founder wants.

## Tool disclosure

No stray tool calls. All Figma writes went through `use_figma`; screenshots were downloaded to the session scratchpad only, not committed.
