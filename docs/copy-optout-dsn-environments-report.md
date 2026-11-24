# CH-F9 report: AWS opt-out set, Sentry DSN held, both Render environments deployed

Branch `copy/optout-dsn-environments`, docs only, 2026-11-23. Decision Log #555, register Section 122. No B-ID added (324), 146 gap frames unchanged. Base `origin/main` at `f312766` (CH-F8b; CH-F7 `38e8b4c` is merged). Source of every change: the founder statements of 2026-11-23 (the AWS Organizations "Opt out from all services" policy was set before the Rekognition key was configured; the deployed API holds the Sentry DSN, EU region; both Render environments are deployed). The product has not launched and holds no data from real use. No key, DSN or secret was read, looked for or written.

## Versions

Legal copy v0.23 to v0.24. DPIA v0.15 to v0.16. Incident plan v0.13 to v0.14. Post-media addendum v0.11 to v0.12. Post-media Part C v0.7 to v0.8. Contest and view-data addendum v0.7 to v0.8. View-data Part C v0.7 to v0.8. Cloudflare draft unchanged at v0.6 (no stale statement, no pointer moved). Counsel pack v1.5 to v1.6, Word file rebuilt.

## Every changed line (word level: removed words / added words)

Lines are physical line numbers after the edit; no line was added, removed or split.

| File | Line | Old words | New words |
| --- | --- | --- | --- |
| legal-copy-draft-tos-privacy-policy.md | 3 | (v0.23): | (v0.24): |
| legal-copy-draft-tos-privacy-policy.md | 36 | 0.23 | 0.24 |
| legal-copy-draft-tos-privacy-policy.md | 40 |  | v0.24 (2026-11-23): the deployed API holds the Sentry DSN in staging and production (founder statement); the product has not launched. No rule or figure changed. |
| legal-copy-draft-tos-privacy-policy.md | 918 | DSN exist, Render is configured and the API is deployed, | exists, the deployed API holds the DSN in staging / production, / **[v0.24 CHANGED, Sentry DSN held by the deployed API, both environments deployed, 2026-11-23]** |
| sprint-1-dpia-outline-draft.md | 29 | (v0.12) | (v0.12); AWS opt-out set before the key, Sentry DSN held by the deployed API, both Render environments deployed `copy/optout-dsn-environments` (v0.16) |
| sprint-1-dpia-outline-draft.md | 30 | (v0.15) | (v0.15); revised 2026-11-23 (v0.16) |
| sprint-1-dpia-outline-draft.md | 34 | 0.15 | 0.16 |
| sprint-1-dpia-outline-draft.md | 62 |  | v0.16 (2026-11-23): the AWS opt-out was set before the Rekognition key was configured, the deployed API holds the Sentry DSN (EU data region) and both Render environments, staging and production, are deployed (founder statements, 2026-11-23); R12's status p... |
| sprint-1-dpia-outline-draft.md | 488 | deployed, | deployed in staging and production, |
| sprint-1-dpia-outline-draft.md | 562 | a real DSN now exists and the API is deployed; whether / it is not confirmed | the DSN in staging and production, EU data region **[v0.16 CHANGED, AWS opt-out set, Sentry DSN held, both environments deployed, 2026-11-23]** |
| sprint-1-dpia-outline-draft.md | 979 | yet live | deployed in staging and production, but the product has / launched and nothing has run on real use **[v0.16 CHANGED, AWS opt-out set, Sentry DSN held, both environments deployed, 2026-11-23]** |
| sprint-1-dpia-outline-draft.md | 1290 | (wired, not live), / Sentry is wired with a real DSN, but nothing / Which are live | (the account exists), / the API / in staging and production, holding the Sentry DSN / Whether they work there / **[v0.16 CHANGED, AWS opt-out set, Sentry DSN held, both environments deployed, 2026-11-23]** |
| sprint-1-dpia-outline-draft.md | 1303 | No live deployment / recorded / repository; | The API / deployed on Render / staging and production, but / product has not launched and the record does not show these controls verified there; |
| sprint-1-dpia-outline-draft.md | 1304 | but live deployment as unverified, | deployed, and |
| sprint-1-dpia-outline-draft.md | 1305 | email provider (Postmark) / wired but not live. | Postmark account as existing / wired, with the DSN held by the deployed API; none of it is recorded as verified in operation. **[v0.16 CHANGED, AWS opt-out set, Sentry DSN held, both environments deployed, 2026-11-23]** |
| sprint-1-dpia-outline-draft.md | 1762 | Sentry has a real DSN now and the API is deployed, so until the / runs with it / B-267) | The / holds the Sentry DSN in staging and production, and no alert rule is recorded as set up / B-267), so |
| sprint-1-dpia-outline-draft.md | 1763 | the log only. | Sentry, where nobody is yet alerted. |
| sprint-1-dpia-outline-draft.md | 1922 | A real DSN exists and the / (whether it / is not confirmed), | The / in staging and production and / (EU data region), |
| incident-response-and-breach-notification-plan-draft.md | 1 | v0.13) | v0.14) |
| incident-response-and-breach-notification-plan-draft.md | 6 | Q24**), | Q24; v0.14 also reflects the founder's statements of 2026-11-23 on the AWS opt-out, the Sentry DSN and both Render environments**), |
| incident-response-and-breach-notification-plan-draft.md | 10 | deployed); | and v0.14 / deployed in staging and production; the deployed API holds the Sentry DSN, EU data region; the AWS opt-out was set before the key was configured) **[v0.14 CHANGED, AWS opt-out set, Sentry DSN held, both environments deployed, 2026-11-23]**; |
| incident-response-and-breach-notification-plan-draft.md | 45 |  | v0.14 (2026-11-23): the AWS opt-out was set before the Rekognition key was configured, the deployed API holds the Sentry DSN (EU data region) and both Render environments, staging and production, are deployed (founder statements, 2026-11-23); the product ha... |
| incident-response-and-breach-notification-plan-draft.md | 56 | v0.23, / v0.15, / v0.13 | v0.24, / v0.16, / v0.14 |
| incident-response-and-breach-notification-plan-draft.md | 71 | Render, | Render in staging and production, |
| incident-response-and-breach-notification-plan-draft.md | 230 | has a real / the API is deployed, | the deployed API holds the / (EU data region) in staging / production, |
| incident-response-and-breach-notification-plan-draft.md | 260 | (a real / exists / nothing | (the deployed API holds the / no alert rule |
| incident-response-and-breach-notification-plan-draft.md | 261 | deployed; | set up yet **[v0.14 CHANGED, AWS opt-out set, Sentry DSN held, both environments deployed, 2026-11-23]**; |
| incident-response-and-breach-notification-plan-draft.md | 370 | the API runs with `SENTRY_DSN` and / (c)).** | (c)); the deployed API already holds `SENTRY_DSN`.** |
| incident-response-and-breach-notification-plan-draft.md | 377 | Render, | Render in staging and production, |
| incident-response-and-breach-notification-plan-draft.md | 394 | exists / the API is deployed, | the deployed API holds the / (staging / production), |
| incident-response-and-breach-notification-plan-draft.md | 396 | is a founder launch step | the AWS Organizations / was set before the key was configured (founder statement, 2026-11-23) **[v0.14 CHANGED, AWS opt-out set, Sentry DSN held, both environments deployed, 2026-11-23]** |
| incident-response-and-breach-notification-plan-draft.md | 424 | deployed, | deployed in staging and production, |
| incident-response-and-breach-notification-plan-draft.md | 704 | A real / exists / the API is deployed, | The deployed API holds the / in staging / production, |
| incident-response-and-breach-notification-plan-draft.md | 902 | The API running with the real `SENTRY_DSN`, and alert | Alert |
| incident-response-and-breach-notification-plan-draft.md | 916 | v0.23, / v0.15, / v0.13 | v0.24, / v0.16, / v0.14 |
| incident-response-and-breach-notification-plan-draft.md | 937 | v0.23 | v0.24 |
| dpia-addendum-post-media-draft.md | 25 | (v0.11) | (v0.11); revised 2026-11-23 (v0.12) |
| dpia-addendum-post-media-draft.md | 26 | 0.11 | 0.12 |
| dpia-addendum-post-media-draft.md | 44 |  | --- v0.9 (2026-11-23): "v0.3 DPIA" labels updated to the current DPIA where the cited section still says what the sentence relies on; labels in sentences that describe the old DPIA text as stale were left. v0.8 (2026-11-22): the pending-legal-review tag was... |
| dpia-addendum-post-media-draft.md | 113 |  | in staging and production / **[v0.12 CHANGED, AWS opt-out set, Sentry DSN held, both environments deployed, 2026-11-23]** |
| dpia-addendum-post-media-draft.md | 175 | v0.15 | v0.16 / **[v0.12 CHANGED, DPIA label moved to v0.16; the cited item reads the same]** |
| dpia-addendum-post-media-draft.md | 325 | v0.15 | v0.16 / **[v0.12 CHANGED, DPIA label moved to v0.16; the cited item reads the same]** |
| dpia-addendum-post-media-draft.md | 341 | v0.15 | v0.16 / **[v0.12 CHANGED, DPIA label moved to v0.16; the cited item reads the same]** |
| dpia-addendum-post-media-draft.md | 405 | out is not | out: it was |
| dpia-addendum-post-media-draft.md | 406 | decided and not / records | set before the key was / recorded |
| dpia-addendum-post-media-draft.md | 407 | decide / keys | the founder set it / the / key |
| dpia-addendum-post-media-draft.md | 408 | are used. / requires / does not exist today.]** | was configured. / needs / the founder has in place.]** **[v0.12 CHANGED, AWS opt-out set, Sentry DSN held, both environments deployed, 2026-11-23]** |
| dpia-addendum-post-media-draft.md | 544 | v0.15. | v0.16. / **[v0.12 CHANGED, DPIA label moved to v0.16; the cited item reads the same]** |
| dpia-addendum-post-media-draft.md | 604 | but whether / is not confirmed. / whether done is not confirmed).* | and / before it (founder statement, 2026-11-23). / done).* / **[v0.12 CHANGED, AWS opt-out set, Sentry DSN held, both environments deployed, 2026-11-23]** |
| dpia-addendum-post-media-draft.md | 615 | v0.15 | v0.16 / **[v0.12 CHANGED, DPIA label moved to v0.16; the cited item reads the same]** |
| dpia-addendum-post-media-draft.md | 859 | but whether / is not confirmed | and / before it / **[v0.12 CHANGED, AWS opt-out set, Sentry DSN held, both environments deployed, 2026-11-23]** |
| dpia-addendum-post-media-draft.md | 875 | v0.15 | v0.16 / **[v0.12 CHANGED, DPIA label moved to v0.16; the cited item reads the same]** |
| dpia-addendum-post-media-draft.md | 973 | v0.15 | v0.16 / **[v0.12 CHANGED, DPIA label moved to v0.16; the cited item reads the same]** |
| legal-copy-part-c-post-media-draft.md | 17 |  | APPROVED); revised 2026-11-23 (**v0.8**, still draft, NOT |
| legal-copy-part-c-post-media-draft.md | 35 |  | --- v0.5 (2026-11-23): the stale version pointer in section 2 note updated to the current legal draft; nothing else changed. v0.4 (2026-11-22): the pending-legal-review tag was removed from every place it appeared in this draft, on the founder's decision of... |
| legal-copy-part-c-post-media-draft.md | 47 | v0.23; | v0.24; / **[v0.8 CHANGED, legal draft label moved to v0.24; the numbers statement is unchanged]** |
| legal-copy-part-c-post-media-draft.md | 142 | but whether / is not confirmed. / whether done is not confirmed).]* | and / before it (founder statement, 2026-11-23). / done).]* / **[v0.8 CHANGED, AWS opt-out set before the key, 2026-11-23]** |
| legal-copy-part-c-post-media-draft.md | 263 | not yet | **[v0.8 CHANGED, AWS opt-out set before the key, 2026-11-23]** |
| dpia-addendum-contest-view-data-draft.md | 26 |  | APPROVED); revised 2026-11-23 (**v0.8**, still draft, NOT |
| dpia-addendum-contest-view-data-draft.md | 39 |  | --- v0.5 (2026-11-23): "v0.3 DPIA" labels updated to the current DPIA on lines where the cited section still says what the sentence relies on; line 212 (risk numbering) and line 54 were left. v0.4 (2026-11-22): the pending-legal-review tag was removed from ... |
| dpia-addendum-contest-view-data-draft.md | 69 | v0.15 | v0.16 / **[v0.8 CHANGED, DPIA label moved to v0.16; the cited item reads the same]** |
| dpia-addendum-contest-view-data-draft.md | 214 | v0.15. | v0.16. / **[v0.8 CHANGED, DPIA label moved to v0.16; the cited item reads the same]** |
| legal-copy-part-c-view-data-draft.md | 17 |  | APPROVED); revised 2026-11-23 (**v0.8**, still draft, NOT |
| legal-copy-part-c-view-data-draft.md | 30 |  | --- v0.5 (2026-11-23): the stale version pointer on the "Stale in this file" line updated to the current legal draft; the row-number statement was not re-checked. v0.4 (2026-11-22): the pending-legal-review tag was removed from every place it appeared in th... |
| legal-copy-part-c-view-data-draft.md | 40 | **v0.23** | **v0.24** / **[v0.8 CHANGED, legal draft label moved to v0.24; the row statement is unchanged]** |
| counsel-review-pack.md | 5 | 1.5, / `copy/rekognition-render-live`. | 1.6, / `copy/optout-dsn-environments`. |
| counsel-review-pack.md | 28 | v0.23 | v0.24 |
| counsel-review-pack.md | 32 | v0.23 | v0.24 / disposition changed. v0.24 records that the deployed API holds the error-monitoring key (Sentry, EU region) in staging and production; the product has not launched and no |
| counsel-review-pack.md | 33 | v0.15 | v0.16 / v0.16 records that the AWS opt-out was set before the check key was configured, that the deployed API holds the Sentry key (EU region), that both Render environments are deployed, and updates the status of R12; the product has not launched and no ri... |
| counsel-review-pack.md | 34 | v0.13 | v0.14 / v0.14 points to legal copy v0.24 and DPIA v0.16; no disposition changed. |
| counsel-review-pack.md | 35 | v0.11 | v0.12 / v0.12 records that the AWS opt-out was set before the check key was configured and that the API is deployed in staging and production, and points to DPIA v0.16; no disposition changed. |
| counsel-review-pack.md | 36 | v0.7 | v0.8 / v0.8 records that the AWS opt-out was set before the key was configured and points to legal copy v0.24; no disposition changed. |
| counsel-review-pack.md | 37 | v0.7 | v0.8 / v0.8 points to DPIA v0.16; no disposition changed. |
| counsel-review-pack.md | 38 | v0.7 | v0.8 / v0.8 points to legal copy v0.24; no disposition changed. |
| counsel-review-pack.md | 1025 | v0.23 | v0.24 |
| counsel-review-pack.md | 1026 | v0.15 | v0.16 |
| counsel-review-pack.md | 1027 | v0.13 | v0.14 |
| counsel-review-pack.md | 1028 | v0.11 | v0.12 |
| counsel-review-pack.md | 1029 | v0.7 | v0.8 |
| counsel-review-pack.md | 1030 | v0.7 | v0.8 |
| counsel-review-pack.md | 1031 | v0.7 | v0.8 |

Source for the status changes: the founder statements above. Version and pointer changes: the new version numbers of this task.

## Checks

1. `counsel-pack-check.py`: output and exit code identical to the baseline (exit 0).
2. Per-draft stats against the baseline: line counts, CRLF counts, `[PROPOSAL`/`[OPEN` markers, dispositions, dashes and the pending-review tag count are unchanged in all nine files. Only the count of `[v` change markers rose, as expected (legal copy +1, DPIA +4, incident plan +3, post-media addendum +11, post-media Part C +3, contest addendum +2, view-data Part C +1). Cloudflare draft untouched.
3. No new literal pending-review tag in any draft. (One tag string appears in the Decision Log docx diff; it is old text in row #307, not added.)
4. `npm run build:release` built both apps; `npm run check:pending-copy` reports OK; `apps/web/src/pages/legal` tests 12 passed.
5. Decision Log row count +1 (#555), earlier rows identical.

## Not changed, for the founder

- Counsel pack Q16 (line 145) still rests on older wording; it is frozen by the line-number rule.
- Nothing is sent to AWS unless the check key is used; the drafts say what the founder stated and no more.
- No key, DSN or secret was read or written.
