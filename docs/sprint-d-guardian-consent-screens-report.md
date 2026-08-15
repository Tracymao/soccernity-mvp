# Sprint D — Guardian-Consent Flow Screens

Build Plan Section 6 (Sprint D, second half) / Section 8.3. Six screens
designed in Figma file "Soccernity-MVP" (key `weZWWqggy9j13eX8bhFgs6`),
page "Soccernity" (`0:1`), by the `figma-screen-builder` agent. This
document is the git-side record of that Figma-only session; the source
of truth is the Figma frames themselves, grouped under a "Guardian
Consent" section directly below the existing Auth Pages section, plus a
"Design Notes" frame (`5116:6633`) carrying the same flagged items listed
in §3 below.

Verified independently before treating this as complete: the
"Soccernity Theme" variable collection (`VariableCollectionId:5096:2`,
10 variables, Light/Dark modes) was confirmed live before design work
started, and two of the six frames (Age Gate, Restricted Pending State)
were screenshotted and visually reviewed after the fact — both render
correctly, dark-mode-native, using only the existing brand tokens.

## 1. Patterns reused

Extracted from existing Auth screens before drawing anything new: the
1440×900 split shell (720 form / 720 brand panel) from Login (`407:844`);
the two-up field row and Form auto-layout conventions from Register
(`407:1051`); the Success email template structure (`1380:2318`,
`1661:2724`) for the consent-email reference artifact; and the
centred-state-plus-two-actions pattern from Inactive Account (`1662:2782`)
for the restricted-pending and activation screens.

## 2. The six screens

| # | Frame name | Node ID | Size | What's new vs. the reused pattern |
|---|---|---|---|---|
| 1 | Guardian Consent — 1 Age Gate | `5108:6626` | 1440×900 | DD/MM/YYYY three-field row (extends Register's two-up pattern); a green-tint "Why we ask" panel that discloses the guardian step *before* the minor enters a birth date |
| 2 | Guardian Consent — 2 Guardian Details Capture | `5108:6627` | 1440×1200 | A new `Select` primitive (built from the existing Input geometry, no new style); a "What we send them" panel |
| 3 | Guardian Consent — 3 Consent Email (Reference) | `5108:6628` | 680×965 | A CTA button (none of the four existing email templates have one) plus a plaintext fallback URL and expiry/security notice |
| 4 | Guardian Consent — 4 Web Consent Confirmation | `5108:6629` | 1440×1788 | A 760px centred card with three plain-language sections (what the account can do / what's collected / what stays off) — the "what stays off" section isn't in Section 8.3's wording but was added because it's what makes a guardian confident saying yes |
| 5 | Guardian Consent — 5 Restricted Pending State | `5108:6630` | 1440×1217 | Each of Section 8.3's three restrictions as an individually bordered row with its own OFF pill, paired with a "What you can still do" panel |
| 6 | Guardian Consent — 6 Activation Confirmation | `5108:6631` | 1440×1204 | Mirrors screen 5's rows flipped to ON for direct before/after legibility, plus a "some protections stay on because you're under 18" panel so activation doesn't read as an unrestricted adult account |

All six sit at x 44433–50609 / y 3200–8093, directly below the existing
Auth Pages section — confirmed zero overlap against the file's other 264
pre-existing nodes.

## 3. Flagged — product/legal decisions, not resolved here

1. **Regional minimum age (Decision Log #7, open, blocks Sprint 1).**
   Screens assume "under 18." GDPR Art. 8 allows 13–16 depending on
   member state. Affects the Age Gate's threshold and the Guardian
   Details copy. Recommend resolving this first, since it changes the
   flow's actual trigger condition.
2. **All consent copy is placeholder**, marked `[COPY PENDING LEGAL
   REVIEW]` on screens 2–4. This is `safeguarding-drafter`'s remit and
   is not approved for use until legal counsel signs off — do not lift
   this text into code.
3. **Guardian-relationship options undefined** — the Select on screen 2
   has no option list yet (parent / legal guardian / carer / other?),
   and whether "other" needs supporting evidence.
4. **Restricted-pending scope undefined** beyond the three restrictions
   Section 8.3 names. Screen 5 assumes Grassroots and Sports Hub stay
   available during the pending state; Section 8.3 doesn't say either
   way. Flagged on-canvas in the Restricted Pending frame itself.
5. **False or disputed date-of-birth has no designed screen or
   specified behaviour.** Not one of the six items in scope.
6. **No age-gate rejection/denial state was designed.** A below-minimum-
   age refusal needs a distinct error/denial colour, and none exists in
   the two-colour brand palette — inventing one would violate CLAUDE.md's
   non-negotiable #3. This needs `figma-design-system` (or an explicit
   palette decision) before it can be designed, not `figma-screen-builder`.
7. **Register (`407:1051`) has no date-of-birth field** — nothing
   currently triggers this flow. Not modified (out of scope for this
   task); flagged as a dependency for whoever wires the flow up.
8. **"Community groups" vs. "Banter Rooms" (Log Book 24.4, open).**
   Screens 4–6 all say "Banter Rooms are read-only." If Community groups
   and Banter Rooms turn out to be one feature rather than two, this
   under-restricts on all three screens.
9. **Consent withdrawal has no designed screen**, though screens 4 and 6
   both promise the guardian/minor can withdraw consent later. Not in
   Section 8.3's six items.
10. **Email dark-mode rendering** is an engineering question, not a
    design one — screen 3 is variable-bound in Figma, but real email
    clients handle `prefers-color-scheme` inconsistently.
11. **Existing Login/Register/Header screens are not yet token-bound**
    (still carry some hardcoded hex values) — flagged, not touched here;
    it's `figma-design-system`'s job and the two new screen families will
    look inconsistent side-by-side in dark mode until that lands.
12. **New token requested: `color/text/on-navy`.** The always-navy "Why
    we ask" / "What we send them" panels on screens 1–2 can't use
    `color/text/primary` (it resolves to navy-on-navy in Light mode).
    Two text layers were left as hardcoded white as the only intentional
    unbound fills in this whole deliverable, pending `figma-design-system`
    adding a token mirroring the existing `color/text/on-green` pattern.
    No new brand colour is implied — this is a text-color token for an
    existing navy background, same pattern already used for on-green text.

## 4. Process note

`figma-screen-builder` reported it could not load its mandatory `figma-use`
skill in this session (no Bash tool, no MCP-resource read tool available
to it) and worked from the practices it already knew, verifying every
screen with a screenshot rather than skipping verification. Output quality
held up under independent review, but this is a second instance (after the
earlier `mcp__figma__*` vs `mcp__claude_ai_Figma__*` tool-prefix bug) of a
Figma-agent provisioning gap in this repo — worth a look before the next
Figma agent run.
