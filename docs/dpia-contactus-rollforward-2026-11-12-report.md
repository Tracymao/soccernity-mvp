# DPIA and incident plan - Contact Us roll-forward (2026-11-12)

> **Draft correction for counsel review - NOT APPROVED, NOT LEGAL ADVICE.** Nothing here has been seen by counsel. No sign-off was given or implied.

**Branch:** `docs/dpia-contactus-rollforward-2026-11-12`, cut from `origin/main` `e2eac9a` (after `docs/security-rollforward-2026-11-12`, PR #744, merged).
**Handshake:** the DPIA draft was v0.6 and the incident plan v0.4 on `main`, as the brief expected; nothing had moved.
**Files changed:** `docs/sprint-1-dpia-outline-draft.md` (v0.6 to v0.7), `docs/incident-response-and-breach-notification-plan-draft.md` (v0.4 to v0.5), this report, `CLAUDE.md` (one status bullet). Nothing else.

## 1. The fact that changed (read from `origin/main`)

v0.6 said the seventh Contact Us category "Appeal a suspension" (`suspension_appeal`) exists only in the API. It is now also in both apps:

| Claim | Code that proves it |
|---|---|
| The key is in the API | `services/api/src/modules/contact/contact.constants.ts` lines 18 and 31; migration `20261128100000_add_contact_suspension_appeal_category` |
| The public Contact Us page offers it, last in the list | `apps/web/src/api/contact.ts` line 20 (`CONTACT_CATEGORIES`); `apps/web/src/pages/ContactPage.tsx` line 59 (label "Appeal a suspension") |
| The helper line shows only while it is chosen | `ContactPage.tsx` line 68 (`APPEAL_HELPER`, "Use the email address your Soccernity account is registered with so we can find it.") and line 317 (`category === "suspension_appeal" && ...`) |
| The admin inbox carries it | `apps/admin/src/api/contactEnquiries.ts` lines 20 and 33; `ContactEnquiriesPage.tsx` builds the Category filter from `CONTACT_CATEGORIES` (lines 160-166) and prints `contactCategoryLabel(item.category)` (line 43) |
| Merged by | PR #739 (`frontend/b298-contact-appeal-category`, merge commit `4eb86df`); commit `e750d65` |

**PR number note.** The brief said PR #737 put the category in the admin inbox. `git log` shows #739 did both the web page and the admin inbox in one commit; #737 is the web removed-message bubble (B-295/B-296). The drafts therefore cite #739 only.

## 2. Sentences changed

Every change is marked `[CHANGED v0.7 - 2026-11-12]` (DPIA) or `[v0.5 CHANGED - PR #739]` (plan) so a reader can find them by search. The `git diff` against v0.6 contains only these, plus the version bumps and one changelog entry.

### DPIA `docs/sprint-1-dpia-outline-draft.md`

| # | Where | Old text | New text |
|---|---|---|---|
| 1 | Header lines | "Sprint / PR" ended at v0.6; "Draft date" ended "revised 2026-11-11 (v0.6)"; "Version: 0.6" | A v0.7 entry on each; "Version: 0.7 (draft - still NOT APPROVED)" |
| 2 | New changelog block "v0.6 to v0.7 (2026-11-12)" above the v0.5 to v0.6 block | (none) | Says what the update is, that no risk was added or closed, and points to this report |
| 3 | Section 0 (v0.6 changelog) item 4 | "...a seventh public Contact Us category "Appeal a suspension" exists in the API. This **answers R35(c)(i) in code**; the web page and the admin inbox do not offer the category yet." | Same sentence, with "...; **[CHANGED v0.7]** it is now also offered on the public Contact Us page and in the admin inbox (PR #739; v0.6 said it was not)." |
| 4 | R35 update, item 1 | "(the API accepts it and Figma draws it; **the web Contact Us page and the admin inbox filter do not offer it yet**, found by search: the key appears only under `services/api`)" | "(the API accepts it and Figma draws it; **[CHANGED v0.7]** the public Contact Us page offers it in its category list and shows the helper line while it is chosen, and the admin Contact enquiries filter, list and detail labels carry it: `apps/web/src/api/contact.ts`, `ContactPage.tsx`, `apps/admin/src/api/contactEnquiries.ts`, PR #739; v0.6 said these did not and that the key appeared only under `services/api`)" |
| 5 | Section 5 row 37 | "...are merged in the API; the web page and the admin inbox are not built; the 30-day window runs meanwhile" | "...are merged in the API; **[CHANGED v0.7]** the Contact Us category is now also offered on the web page and in the admin inbox (PR #739; v0.5 and v0.6 said these were not built); the in-app appeal still needs a sign-in; the 30-day window runs meanwhile". The status cell "Gap flagged; build item B-292" is unchanged. |

### Incident plan `docs/incident-response-and-breach-notification-plan-draft.md`

| # | Where | Old text | New text |
|---|---|---|---|
| 6 | Title | "(DRAFT v0.4)" | "(DRAFT v0.5)" |
| 7 | Marker legend | (no v0.5 marker) | One line defining `[v0.5 CHANGED - source]` and saying only one sentence changed |
| 8 | Section 4.10, "Appeals of a suspension" | "(seventh category, "Appeal a suspension"; the API accepts it, the web page and the admin inbox do not offer it yet)" | "(seventh category, "Appeal a suspension"; **[v0.5 CHANGED - PR #739]** the API accepts it and the public Contact Us page and the admin inbox filter now offer it too; v0.4 said the web page and the admin inbox did not)" |

## 3. Sentences checked and left alone

| Where | Why it stands |
|---|---|
| DPIA section 0 item 2; the "Three more things hang off a report" paragraph near line 414; R36(i) item 1 (near line 1692) - what happens to an `AccountHold` row when a report is purged | **Checked against Decision Log #493 (a), #496 and the merged migration, as the brief asked, and they match.** The drafts say the hold row stays, `reportId` is set to NULL, and the CHECK that required a bad-faith hold to keep a report was relaxed. Migration `20261129090000_account_hold_report_detachable` replaces only `AccountHold_type_shape_check`: bad-faith still needs an `expiresAt`, legal hold still has none, the `reportId IS NOT NULL` clause is dropped. No difference to report. |
| DPIA line ~416-417 - "...the email address on the account that the helper line asks for" | Still true: the helper line on `ContactPage.tsx` is exactly that request, and it is now a shown fact, not only a planned one. |
| R35 update item 2(a) - "the helper line (B-298) asks for the email address on the account", the enquiry "is stored as a guest's", deleted 12 months after its last message unless escalated | True of the built page and API. |
| R35 update item 2(c), section 5 row 44, plan section 4.10 and Q24(b) - the enquiry inbox has no child-safety-vetting gate | Still true. `services/api/src/modules/contact/contact-enquiry-admin.service.ts` calls `assertAdminChildSafetyVetted` (line 202) only when an admin escalates with the minor flag; list and detail have no such gate. Adding the category to the inbox did not change this. |
| R35 update item 1 heading: "(c)(i) is answered in code, but only partly in the product" | Kept. The Gap/status wording was told to stay unless a fact changed it. The new fact is that the category is on the page and the inbox; what is still partial is that a suspended person cannot use the in-app appeal (`POST /reports/:id/appeal` needs a sign-in) and a user-page suspension has no report, so a moderator reviews the enquiry by hand. Whether "only partly in the product" is still the right heading is **a call for you**: the drafter kept it. |
| Section 5 row 44 and §0 item 4 "It also means a Contact Us enquiry may hold a child's account details" | True and, if anything, more true now the page asks for it. |
| Plan line 37 (change table, row 4), plan Q24 and the plan's retention rows | Do not say the category is unbuilt; unchanged. |
| `docs/dpia-addendum-post-media-draft.md` | Contains no statement about this category (searched). Not touched. |

## 4. Not added: possible new points for you

The brief said not to add analysis. Two things I noticed and did **not** write into the drafts:

1. **Stale page comment in code.** `apps/admin/src/pages/moderation/ContactEnquiriesPage.tsx` line 11 still says the filter offers "the six Contact Us categories". The filter itself offers seven. Code, out of scope here.
2. **The helper line is guidance, not a check.** It asks the person to use their account email, but the form does not verify it; a child could type any address and a moderator would still have to match it by hand. The DPIA already says the enquiry "can tie a child's account to an address", so no new risk is claimed. If you want it named as a point for counsel, say so.

## 5. What I did not do

- No counsel review has happened. Both drafts are still unapproved; the DPIA sign-off block is still empty.
- No test suite, `tsc` or build was run (docs only). `apps/web` `LegalPage.test.tsx` is not touched by these files.
- I cannot read CI from here.
- I did not edit `docs/build-register.md`, any `.docx`, Figma, code, or `docs/pending-copy-manifest.md`, and I did not describe the pending-copy tags.
- I did not re-verify the rest of either draft. Statements outside the Contact Us category are unchanged from v0.6 and v0.4.
