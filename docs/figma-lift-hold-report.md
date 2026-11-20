# Figma: reason field on the Lift Hold Confirm dialog

Branch `design/lift-hold-reason-field`, from fresh `origin/main` (`57f4621`). Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only: no application code, schema, Build Plan docx, `docs/build-register.md` or `docs/pending-copy-manifest.md` touched.

## Why

PR #534 (B-045) found that the Lift Hold Confirm frame `6672:27420` drew no reason field, although Decision Log #403 item 8 and the server (`PATCH /admin/moderation/holds/:holdId/lift`) require a reason of 10 to 500 characters, as the two sibling dialogs already ask.

## Frames touched

| Frame | Node | Change |
|---|---|---|
| Admin — Report Detail — Lift Hold Confirm | `6672:27420` (dialog `6672:27473`, Body `6672:27479`) | New `Field — Reason (required)` (`6870:30614`) in the Body, above the help line; help line changed to the sibling sentence |
| Admin — Held Investigations | `6647:23351` | The two visible `Button — Lift hold` instances (`6723:28887`, `6723:28889`) now carry `ON_CLICK` -> `NAVIGATE` -> `6672:27420` |

Nothing else was edited. The frame stays 1440 x 1184 and the dialog stays 560 wide (it grew in height from 247 to 382, the same as the Bad Faith and Legal Hold dialogs). Dialog position is unchanged (440, 240).

## 1. Reason field

Cloned the field frame of the sibling Bad Faith dialog (`6672:27339`) into the Lift dialog's Body, between the body sentence and the help line, and set it to fill the Body width. It carries the label "Reason (required)" and the placeholder "Enter the reason for this action." exactly as the siblings do, with the same tokens (the clone inherits every binding). The help line now reads "The reason is saved to the audit record. [COPY PENDING LEGAL REVIEW]", character for character the sentence in `6672:27343` / `6672:27414` (the tag is part of that sentence). It replaces "Lifting a hold is saved to the audit record. [COPY PENDING LEGAL REVIEW]". No other wording was written. The button row (Cancel and Lift hold, both existing `Button` instances) is untouched.

**Deviation from the brief, flagged:** the brief says to use the siblings' "component instances". In the siblings the Reason field is a local frame, not an instance of the F2 Field component (pass G2 / Decision Log #405 item 10 left Field as a local frame). I cloned that local frame, which is what "the same as the siblings" means in practice. Cancel and the primary button are instances.

The Body still holds the hidden `ARCHIVED — Field — Rejection reason (not used for lift hold)` frame (`6672:27481`); it was left hidden, not deleted.

## 2. Validation and error states

The siblings draw none: each of the two sibling dialogs exists as exactly one frame (names matching Bad Faith / Legal Hold / Lift Hold on page `0:1`: `6672:27278`, `6672:27349`, `6672:27420`, `6672:28898`, `6672:29059`). Added no state.

## 3. Lift hold prototype links

| Frame | Lift hold control drawn? | Link before | Link after |
|---|---|---|---|
| Held Investigations `6647:23351` | Yes, two visible buttons (Kemi Okoro, legal hold; Tolu Mensah, bad faith; the open-report row shows a dash) | None on both | `ON_CLICK` NAVIGATE to `6672:27420` on both (read back) |
| Held Investigations — Empty `6647:23603` | No (no rows) | n/a | n/a |
| Held Investigations — Validation `6647:23831` | No (no rows) | n/a | n/a |
| Report Detail — Legal Hold Active `6672:28898` | Yes (`6723:28891`) | Already NAVIGATE to `6672:27420` | unchanged |
| Appeal Review — Legal Hold Active `6672:29059` | Yes (`6723:28894`) | Already NAVIGATE to `6672:27420` | unchanged |

Four more `Lift hold` texts exist, inside hidden `ARCHIVED — Button — Lift hold` frames (two on Held Investigations, one each on the two hold-active frames); they were not touched.

## Checks

- Paints on the Lift dialog (visible nodes): 15 solid paints, 15 bound to variables, 0 unbound, no black, no new colour; light mode only; the alert colour is not used in the dialog.
- Whole-page standing check (taken after the pass; no snapshot was taken before the first write, so there is no before/after hash): 1,023 top-level nodes, id hash 1145331174. No stray top-level clone on the cover page. The clone was created and moved inside the dialog in one call.
- Screenshots are in `docs/figma-lift-hold-screens/`: `before-lift-hold-confirm-6672-27420.png`, `after-lift-hold-confirm-6672-27420.png`, `reference-legal-hold-confirm-6672-27349.png` (sibling for comparison), `held-investigations-6647-23351.png`. The after image matches the Legal Hold dialog layout.
- No code is changed, so no test suite was run.

## Follow-ups (not done)

- The Held Investigations buttons open the dialog for Report #1042, because the dialog frame is a single mock. In code, the list item carries no hold id or report id (B-045's own finding), so wiring that button there still needs a backend change.
- The Lift dialog body sentence ("Report #1042. Legal hold. Lifting the hold releases both accounts.") is not changed; it says nothing about a bad-faith hold, which the list can also lift.
- `docs/pending-copy-manifest.md`: the reused sentence is already there; no row added.
- Build register B-045 / Decision Log status lines are for the next docs PR.

## Disclosure

No stray tool calls. One first read-only `use_figma` call returned too much data and was rejected by the tool (nothing written); it was re-run narrower. The shared checkout showed two uncommitted modified files under `services/api/src/modules/account-deletion` and `account-hold` that belong to another session; they are not part of this branch and were not committed.
