# B-301: pending-copy tags for the suspension, appeal, hidden-context and Contact Us appeal wording

Branch `frontend/b301-pending-copy-tags`. Decision Log #497, build-register B-301 (Section 88). Wording-visibility change only: no behaviour, layout, API or schema change.

## What changed

The new wording of B-295 (`apps/admin`) and B-298 (`apps/web`) used to carry `[COPY PENDING LEGAL REVIEW]` only in code comments, so `scripts/check-pending-copy-dist.mjs` could not see it. The literal tag is now part of each rendered string, with one row per string in `docs/pending-copy-manifest.md`. The two "Not yet in any app" bullets of that file are deleted (the rows replace them).

Placement: a suffix on the sentence (`... sentence. [COPY PENDING LEGAL REVIEW]`), the placement `holdActions.tsx` already uses. The one exception is the Contact Us helper line, which uses the same visible chip element the form notice uses (`contact-page__tag`), because the Figma pass V frames draw a chip beside the line. The scanner reads the chip plus the line as one string that starts with the tag, the same as the existing notice row.

## Tagged strings (17)

All rows are in `docs/pending-copy-manifest.md`.

apps/admin
- `SuspendAccountDialog.tsx` (8): `BULLET_SIGN_IN`, `BULLET_POINTS`, `BULLET_GUARDIAN`, `BULLET_EMAIL_REPORT`, `BULLET_EMAIL_USER`, `BULLET_OVERTURNED`, `BULLET_USER_APPEALS`, `CATEGORY_HELP`.
- `RecordAppealDialog.tsx` (3): the two paragraphs and "The reason is saved to the audit record."
- `ReportDetailPage.tsx` (2): "Account suspended. ..." and "Appeal recorded for the account. ..." callouts.
- `UserDetailPage.tsx` (1): "Account suspended. ..." callout.
- `ContextMessagesCard.tsx` (1): `CONTEXT_HIDDEN_MESSAGE` is now "Context hidden: this involves a child. [COPY PENDING LEGAL REVIEW]". It is an exported constant; its only other use is the test, which imports the constant and so follows it. The same text ends in a full stop that the Figma frame does not draw: the tag needs a sentence end, so a full stop was added before it.

apps/web
- `ContactPage.tsx` (2): the option label `Appeal a suspension [COPY PENDING LEGAL REVIEW]` (a plain suffix, shown in the dropdown and in the closed select) and the helper line with its chip. The helper sentence was a constant (`APPEAL_HELPER`); it is now JSX text so the manifest row shows the sentence itself and not `{…}`.

Not tagged, as instructed: the admin inbox label for the same category (`apps/admin/src/api/contactEnquiries.ts`), functional errors ("Choose a reason category.", "Enter a reason for the appeal.", the fallback errors), button and heading labels.

## Comments corrected

The four comments that said the tag is not rendered (SuspendAccountDialog, RecordAppealDialog, ContextMessagesCard, ContactPage) now describe the new state. The ContactPage category-label comment also records that Decision Log #497 reversed pass V's "not tagged" decision.

## Tests

No assertion was weakened. Tests that matched the strings by regular expression or imported constant kept passing; they were strengthened where a string became tagged:
- `suspensionAppealContext.test.tsx`: all five consequence list items end with the tag; the Record-appeal paragraphs and audit line carry it; the "Account suspended" and "Appeal recorded" callouts carry it; `CONTEXT_HIDDEN_MESSAGE` is pinned to its tagged text.
- `suspendAccount.test.tsx`: the five list items and the category help line carry the tag; the user-page callout carries it.
- `ContactPage.test.tsx`: the dropdown option list now expects `Appeal a suspension [COPY PENDING LEGAL REVIEW]` (and only that option tagged); `chooseCategory` calls use the tagged label; the old test "carries no literal tag in the rendered page" is replaced by one that expects the option label tag and a second chip directly before the helper.

## Things that surprised me / for your decision

- The helper line was `{APPEAL_HELPER}` (an expression), which the scanner reduces to `{…}`; moved to JSX text so the manifest row is readable.
- `CONTEXT_HIDDEN_MESSAGE` had to gain a full stop (see above). Say if you prefer another separator.
- Wording in these same builds that reads like a legal or safety statement and was NOT tagged (you decide):
  - The `lead` paragraph of the Suspend dialog (names who is being suspended; set by `ReportDetailPage` and `UserDetailPage`). It makes no promise on its own but sits inside a dialog whose other lines are all tagged.
  - The reason-category radio labels and the "Reason category (required)" legend.
  - The `Account suspended` pill and the Record-appeal button/headings.
  - The "Choose a reason category." and "Enter a reason for the appeal." errors (functional).
  - The admin inbox label "Appeal a suspension" (deliberately not tagged).

## Verification

See the PR description for the measured runs and what was not run.
