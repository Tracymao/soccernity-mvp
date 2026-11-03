# admin-search

`GET /admin/search?q=...` — build-register row B-114, Decision Log #463 (founder decision of 2026-11-02: the admin search bar is built, versions 1 and 2, before launch). This module is the **backend leg**. The Figma frames (results page, grouped rows, empty / loading / error states) and the `apps/admin` bar are separate legs and are **not built here**.

One read-only route. It adds **no new data-access rule**: for each group it applies the rule the matching admin **list** route already applies, and returns no more than that list shows.

## What comes back

```json
{ "groups": { "users": { "items": [...], "truncated": false }, "reports": {...}, ... } }
```

A group a caller's role cannot open is **absent** (the key does not exist). A group the role can open but with no match is **present and empty** (`{ "items": [], "truncated": false }`). `q` is never echoed.

| Group | Who may open it (read from the section's own controller, not copied) | Matches | Returned fields |
| --- | --- | --- | --- |
| `users` | `AdminUsersController` list → moderator, superadmin | user ID exact; **email exact** (lowercased, the column is stored lowercase); **username prefix** (lowercased). An anonymised (`deleted`) account is found by **ID only**. | what the Users list shows: `id, displayName, username, email, accountStatus, createdAt` + `matchedOn` |
| `reports` | `AdminModerationController` list → moderator, superadmin | report ID exact; **report reference** (the first 8 characters of the id, exactly 8 hex characters, as an id prefix); **target username prefix** (reports ABOUT a user whose username starts with the text, or about a post or comment they wrote); given a **user ID**, the reports **by** that user (reporter), **about** that user, and about a post or comment that user wrote (bounded id lists). **Never the free-text reason.** | `id, targetType, targetId, status, severity, concernsMinor, createdAt, source, matchedOn` — never the reason, a contact email, the reporter id or an escalation note |
| `contactEnquiries` | `ContactEnquiryAdminController` list → moderator, superadmin | sender email **exact** (case-insensitive); subject **contains** (case-insensitive) | the inbox list fields + `matchedOn`; **never the message**, never `userId` / `escalatedReportId` (shown as `submitter`, `hasEscalation`, like the list) |
| `articles` | `AdminArticlesController` list → editor, superadmin | title contains (case-insensitive) | `id, title, status, category, publishedAt, createdAt, matchedOn` — never the body |
| `staff` | `AdminStaffRolesController` list → superadmin | name contains; email exact | `id, email, fullName, role, accountStatus, twoFactorEnabled, matchedOn` — `twoFactorEnabled` is a boolean derived from `totpEnabledAt` (same name as `GET /admin/staff`); the secret, the backup codes and the timestamp are never returned |
| `media` | `AdminMediaReviewController` list → moderator, superadmin | media item ID exact; only an item that has been through the queue (as `GET /admin/media-review/:id`) | `id, kind, status, reportCount, createdAt, sources, uploader, matchedOn` — `sources` is derived exactly as the review list does (`auto_check` and/or `user_report`); `uploader` is `{ id, publicName }`, the PUBLIC name only (never an email or a real name) |

### `matchedOn` (backend/b114-search-fields-report-search, Decision Log #464)

One stable key per hit saying which field the text matched; the admin app owns the English label. If several fields would match, the first listed wins.

| Group | Keys |
| --- | --- |
| `users` | `user_id`, `email`, `username` |
| `reports` | `report_id`, `report_reference`, `reporter_user_id`, `target_user_id`, `target_username`, `reason_category` |
| `contactEnquiries` | `email`, `subject` |
| `articles` | `title` |
| `staff` | `email`, `name` |
| `media` | `item_id` |

### Reason category (backend/b284-report-reason-categories, B-284, Decision Log #465)

Reports now carry a fixed **reason category** (`Report.reasonCategory`, see `modules/moderation/README.md` "Reason category"). The search uses it two ways:

* **Returned:** every report hit carries `reasonCategory`: the key (`harassment_or_bullying`, ...) or `null` for a report that was never categorised. The admin app owns the label text.
* **Matched:** a report is also found when the typed text is a **prefix of a category label as an admin reads it**, case-insensitive, runs of spaces treated as one (`harass` finds `harassment_or_bullying`; `hate or abus` finds `hate_or_abusive_language`; `oth` finds `other`). A word from the middle of a label (`bullying`) or the machine key does not match, so a loose query cannot pull in every report. The labels are ONE constant, `REPORT_REASON_CATEGORY_LABELS` in `moderation.constants.ts`; `matchReasonCategories()` in `admin-search.query.ts` reads it. `matchedOn` is `reason_category` when this is why the report was found (an id, reference or target-user match wins if the row also matches one of those).

A short prefix such as `spa` therefore also finds reports categorised `spam_or_scam`, next to any username or other match: that is the cost of a prefix matcher on the minimum 3 characters (an adopted default, veto-able).

**Still true, and pinned by tests:** the free-text description (`Report.reason`) is never selected, searched or returned by this module. A category sets no `severity`, and only `child_safety_concern` sets `concernsMinor` (Decision Log #466: always `true` for that category, see `moderation/README.md`). The child-safety vetting gate on report hits is unchanged: a report that concerns a minor is hidden from an unvetted admin whatever its category, so a `child_safety_concern` report is hidden from an unvetted admin's search.

### Display name (not matched)

The brief asked for reports to match the target's "username or display name (exact or prefix as for users)". The Users group matches the **username prefix only** (never the real name, Decision Log #364 / #369: no one is searched by a real name), so the report matcher follows it. Matching the real `displayName` is a one-line addition if the founder wants it.

Role matrix, therefore: **editor** → `articles`; **moderator** → `users, reports, contactEnquiries, media`; **superadmin** → all six. The role comes from the verified admin access token (the same trust model as `AdminRolesGuard`); the service reads each section's `@AdminRoles` metadata through `Reflector` (handler first, then class, like the guard), so a change to a section's roles changes the search with no edit here. A unit test asserts the two agree for every group.

## Rules every search follows

- `q` is trimmed, then must be **3 to 254 characters** (below / above → `400` with `admin_search_query_too_short` / `admin_search_query_too_long`). Control characters (including NUL, which would make Postgres reject the parameter) → `400 admin_search_query_invalid`. A missing `q` is the same as an empty one. Any other query parameter → `400` (global `ValidationPipe`).
- **Prisma only, no raw SQL.** Prisma passes `contains` / `startsWith` values to `LIKE` unescaped (checked against the real engine: `startsWith: 'a_b%'` is sent as `a_b%%`), so `%`, `_` and `\` are escaped by `escapeLike` and a typed `_` is literal. Proven against Postgres.
- **Emails are exact, never a prefix or a substring**, so the bar cannot be used to enumerate addresses. The exact-email matchers run only when `q` is a whole address.
- **Child-safety vetting is untouched.** For an admin who is not vetted (read fresh, once, only if `reports` or `media` is searched): `concernsMinor` reports and a minor uploader's media are left out — the same conditions `GET /admin/moderation/reports` and `GET /admin/media-review` apply.
- **Never searched, never returned:** date of birth, guardian emails, message / post text, and anything from `GuardianNoticeWithhold`. The service never reads that table, so the response for an unvetted admin is byte-for-byte what it would be if the flag did not exist (a test pins this, including against the same search before the flag was created, and the unit fake throws if any unexpected model is touched).
- **Audit.** A search whose text **contains an `@`** (it may be, or be part of, an email address) writes **one** `AdminActionLog` row: action `admin.search_performed`, targetType `search`, targetId `email`, notes `kind=email results=<n>` (n = total items over the groups the caller can open). **The text typed is never recorded.** A failed write propagates (the log's own rule). Rejected (400) queries write nothing. *No endpoint lists `AdminActionLog` yet (register Section 69c), so these rows are unreadable through the API until one exists; a future reader must hide them from admins who are not child-safety vetted.*

## Defaults chosen (all veto-able; none is stated by the founder)

| Default | Value | Where it comes from |
| --- | --- | --- |
| Minimum query length | 3 | the shortest username (`UpdateUserDto` 3–30) — reused, not invented |
| Maximum query length | 254 | `CONTACT_EMAIL_MAX_LENGTH`, the longest email stored / accepted — reused |
| Per-group result cap | 20 (+1 read to set `truncated`) | Section 5.5 default page size; a test ties `ADMIN_SEARCH_GROUP_CAP` to `ADMIN_USERS_DEFAULT_PAGE_SIZE` |
| Rate limit | **30 requests / 60 s per IP**, `429` over it | **NEW FIGURE.** Uses the existing `@AuthRateLimit({ limit, windowMs })` per-handler override (the form the admin login uses, 5 / 15 min). No existing admin read limit to reuse. |
| Owned-content id lookup (reports by user) | 200 post ids + 200 comment ids | same order as `INCORRECT_DETAILS_LIST_CAP` (a safety cap on a small read); bounds the work, the reports list is capped at 20 anyway |
| Audit trigger | text contains `@` | broader than "is a whole address" on purpose: half an address is personal data too |
| Audit wording | `kind=email results=<n>` | kind and count only |
| Username search | prefix, case-insensitive | usernames are stored lowercase (Decision Log #364) |
| Staff group | superadmin only | the staff routes' own rule |
| Contact enquiries | no vetting filter | the inbox list has none (an escalated minor-concern enquiry is already visible in the inbox to any moderator); matched to the list, not stricter |
| Report ordering | newest first | as every list |

## Notes and limits

- The 429 comes from the shared per-IP `AuthThrottlerGuard`, whose header is `Retry-After-auth` (named after the throttler), not `Retry-After`. Existing behaviour of every `@AuthRateLimit` route; not changed here.
- Admin access tokens are counted by the global limiter as anonymous per IP (documented in the rate-limit module); this route's own limit is per IP as well, so staff behind one office address share it.
- Reports about a user's posts / comments are found only among the user's 200 most recent of each; older reports remain reachable by report ID.
- Search over `Report` by free text (reason) is deliberately not offered. The new report matchers (reference, target username) never read `reason`; a test asserts it is neither selected nor in the `where`.
- The target-username lookup reads at most 200 user ids (`ADMIN_SEARCH_OWNED_CONTENT_ID_CAP`), then at most 200 posts and 200 comments by them. A very common prefix is therefore bounded, not complete.

## Tests

`admin-search.query.spec.ts` (parse, escape), `admin-search.service.spec.ts` (role matrix against the real controllers' metadata, vetting reads, pinned selects, the fake that throws on an unexpected model, caps, audit), `admin-search.controller.http.spec.ts` (HTTP layer, guards, validation), and `test/admin-search.e2e-spec.ts` (real Postgres: matchers, case, wildcard escaping, anonymised user, vetting, withheld-minor identity, pinned response keys, audit row content, 429 on request 31).
