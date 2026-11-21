# CH-E1: next steps in two guardian-consent messages

Branch `copy/guardian-consent-next-steps`, from `origin/main` `5b63cfe`. No other open PR touched `guardian-consent.service.ts`.

## Occurrences found
| File, line | Before | After |
|---|---|---|
| `guardian-consent.service.ts` ~172 (confirm, 400) | Consent for this account was declined or withdrawn and cannot be confirmed with this link. | Consent for this account was declined or withdrawn, so this link can't be used to approve it. If you think this is a mistake, contact support. |
| `guardian-consent.service.ts` ~499 (change-guardian-email, 409) | Consent for this account was declined or withdrawn. | **Left.** Audience is the signed-in minor, not the guardian, and "this link" would be wrong there. |
| `guardian-consent.service.ts` ~294 (report-incorrect-details, 400) | This consent request is no longer awaiting a response. | `confirmed`: You have already approved this account. To withdraw approval, request a withdrawal link. Any other non-pending status: You have already declined this request, so there is nothing more to do with this link. |
| `guardian-card-verification.service.ts` 58 ("no longer awaiting verification") | unchanged | **Left.** Different message, not in scope. |

The decline path (`declineConsent`) does not use message 2 (grep over all of `services/api/src`): only report-incorrect-details did.

## Withdrawal reachability (checked before using the confirmed wording)
`GuardianConsentConfirmPage.tsx` links to `/guardian-consent/withdraw` (the request page) from its footnote (line ~555) and the approved state (~319); `POST /auth/guardian-consent/withdraw/request` exists. **Finding:** the web page's `handleReport` catches every error and shows only "Couldn't send that just now", so the API's message 2 is not displayed there today. It is read by direct API callers. The promise is true either way.

## Client matching, before and after
No client matches on the old or the new texts. `apps/web/src/api/auth.ts` passes any non-generic 400 through verbatim and compares only `GENERIC_CONSENT_REJECTION` (`Invalid or expired consent token`), untouched. Neither new message contains "guardian consent". The awaiting-consent detection files (`writeRefusal.tsx`, `community-groups/errors.ts`, `grassroots/errors.ts`, `ChatWindow`, `ConversationPage`) read server codes since R102/R103, and the grep over `apps/web/src` and `apps/admin/src` finds no regex on these texts.

## Tests
Changed: `GuardianConsentConfirmPage.test.tsx` (mocked message text, assertion still `/declined or withdrawn/`). Added in `guardian-consent-incorrect-details.service.spec.ts`: confirmed variant, declined variant, pending unaffected, no "guardian consent" phrase, confirm message exact text with no reversal wording. `e2e/tests/04-guardian-decline-x3.spec.ts` asserts `/declined or withdrawn/`, still matches the new text; not run.

## Not edited (quote the old texts)
`docs/r104-last-message-match-report.md` (history). No legal draft or counsel pack match found by grep of `docs`.

## Wording notes
None needed rewording beyond the brief. The messages are not tagged `[COPY PENDING LEGAL REVIEW]` (no tag was asked for; they promise nothing).
