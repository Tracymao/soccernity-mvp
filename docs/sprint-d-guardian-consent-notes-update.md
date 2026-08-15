# Guardian-Consent Flow — Design Notes Update

Follow-up to the guardian-consent flow (PR #5, merged). Three items in
the "Guardian Consent — Design Notes & Open Decisions" frame (`5116:6633`)
in Figma file "Soccernity-MVP" (key `weZWWqggy9j13eX8bhFgs6`), page
"Soccernity" (`0:1`), were stale — the underlying decisions were resolved
after PR #5 was built. This is a Figma-only change; all edits were
independently screenshot-verified after being made, not just reported.

## 1. Regional minimum age (Decision Log #7) — now marked RESOLVED

Node `5116:6638` (title `5116:6639`, detail `5116:6640`). Updated to
record: Soccernity deliberately applies guardian consent to the full
under-18 band everywhere it operates, as a safety decision rather than a
compliance minimum (Decision Log #8) — not the regional legal floor. UK
GDPR sets that floor at 13; Soccernity's stricter under-18 threshold
applies regardless. Nigeria's NDPA 2023 Section 31 defines "child" as
under 18, which already matches what the six screens do exactly (Decision
Log #10). **No screen changes were needed** — the Age Gate and Guardian
Details Capture screens were already built against the under-18
threshold; only the note was stale.

## 2. Age-gate rejection state (item #6) — colour question now RESOLVED

Node `5116:6653` (title `5116:6654`, detail `5116:6655`). Updated to
record: no new colour is needed. A rejection screen should use the
existing navy/white treatment already present in the Soccernity Theme
token set, not a dedicated error/denial colour — so the two-colour
palette rule (CLAUDE.md non-negotiable #3) is not at risk. **The
rejection screen itself is still not designed** — that remains a
separate, non-blocking follow-up for `figma-screen-builder`, distinct
from the colour question this note previously blocked on.

## 3. "Community groups" vs "Banter Rooms" (Log Book 24.4) — RESOLVED, and acted on

Node `5116:6659` (title `5116:6660`, detail `5116:6661`). Resolution:
they are two distinct features, and Soccernity needs both (Log Book
Section 24.4).

**Decision made and implemented**: the restricted-pending restriction on
Screens 4, 5, and 6 now extends to Community Groups as well as Banter
Rooms, not just Banter Rooms. Reasoning: both are un-vetted social/group
spaces from a safeguarding standpoint, and restricting only one of the
two would under-restrict exactly the scenario the restricted-pending
state exists to prevent — leaving a minor free to participate in
un-vetted Community Groups while still locked out of the functionally
equivalent Banter Rooms. CLAUDE.md's non-negotiable #1 treats weakening
the restricted-pending state as off-limits; under-restricting it by
omission is the same failure by a different route. Section 8.3 doesn't
enumerate Community Groups explicitly, but it also predates the
two-features resolution — the safer, more consistent reading is to apply
the existing restriction logic to both.

### Screens updated

All three are single title+detail text pairs inside an existing row
component (no new rows, no layout changes — every row already
auto-resizes on `textAutoResize: HEIGHT`, confirmed before editing so
the new wording wouldn't clip):

| Screen | Node | Before | After |
|---|---|---|---|
| 4 — Web Consent Confirmation | `5113:6686` / `5113:6687` | "Join Banter Rooms" / "Group chat about matches, with under-18 safety settings applied." | "Join Banter Rooms & Community Groups" / "Group chats and community spaces about matches, with under-18 safety settings applied." |
| 5 — Restricted Pending State | `5114:6673` / `5114:6674` | "Banter Rooms are read-only" / "You can read the conversation, but you cannot post in it." | "Banter Rooms & Community Groups are read-only" / "You can read posts and conversations, but you cannot post in either." |
| 6 — Activation Confirmation | `5114:6745` / `5114:6746` | "You can post in Banter Rooms" / "Join the conversation, not just read it." | "You can post in Banter Rooms & Community Groups" / "Join the conversation in both, not just read it." |

All four touched frames (Design Notes, and the three screen rows) were
screenshotted after editing and confirmed to render correctly — text
wraps cleanly, no clipping, row heights adjusted automatically, nothing
else on any of the four frames was altered.

## Untouched, as instructed

Items 2, 3, 4, 5, 7, 9, 10, 11, 12 in the Design Notes frame are still
genuinely open and were not modified.
