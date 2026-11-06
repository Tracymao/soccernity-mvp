# data-export -- "Download my data" (B-060)

Decision Log #472, adopted default (g); build-register row B-060. The founder decided the scope and that this is
not flagged to counsel. **Scope of the file: the person's own profile, posts, comments, follows and sent messages.
Nothing else.**

## Routes (all `JwtAuthGuard` only; open to every signed-in account, minors included)

| Route | What it does |
|---|---|
| `POST /users/me/data-export` `{ password }` | Re-confirms the password (wrong = coded **403** `wrong_password`; 403 not 401 so the web client does not refresh and replay a second wrong attempt). One successful request per account per 24 hours, else coded **429** `too_many_requests` (no number in the body). Returns **202** `{ id, status: 'preparing' }`. |
| `GET /users/me/data-export/latest` | `{ status: 'none' or 'preparing' or 'ready' or 'failed', id?, requestedAt?, expiresAt? }`. A `ready` row past its expiry reads `none`. |
| `GET /users/me/data-export/:id/download` | Streams the JSON to its owner only, `Content-Disposition: attachment`, `Cache-Control: no-store`. Another account's id and an unknown id are the SAME 404 (`data_export_not_found`); not ready = 409; past expiry = 410. |

## How it runs

The row is created `preparing` under a per-account advisory lock (so two simultaneous requests cannot both pass
the 24-hour check; a `failed` request does not count). The response returns at once; the file is built by a
detached promise in the same process (no queue service, the `notifyInBackground` pattern) and the row becomes
`ready` (file key, `readyAt`, `expiresAt` = +7 days) or `failed`. A request lost to a restart stays `preparing`;
the daily sweep marks it `failed` after 60 minutes so the person can ask again.

## The file

JSON, stored privately under `data-export/<userId>/<requestId>.json` -- a prefix that is NOT one of the two the
public address serves (`post-media/`, `profile-media/`, see B-265). Every query has an explicit `select` and
every row is mapped field by field (never a spread). Contains: the profile as the owner sees it (not the
password hash, tokens, two-factor secret or backup codes), posts (text, media references, timestamps), comments,
accounts followed as **id and public name only**, and messages the person **sent** (current text of edited
ones). Not included: other people's messages, reports, moderation records, admin notes, guardian data, the
original text of an edited message. Tests fail if a hash, token or other person's data ever appears.

## Clean-up

`DataExportSweepService` (daily, 04:15): stale `preparing` -> `failed`; expired `ready` -> file deleted FIRST,
then the row (a file that cannot be deleted keeps its row for the next run); `failed` rows older than 7 days
removed. The anonymiser and the held-account minimiser delete the person's export rows and stored files
(`DataExportRequest.user` is classified in `anonymized-row-purge.references.ts`).

## Defaults, founder-veto-able

24 hours between requests; 7-day download window; 60-minute "stuck" threshold; page size 500 when reading; the
wording of the 429 message; messages the sender deleted for everyone are not exported; avatar and cover URLs
only once approved; the file is built in memory; limits are constants, not environment variables.

## Open (not decided here)

Whose rights apply to a minor's data request stays with counsel (legal draft Part C row 12, text untouched). The
route is available to every signed-in account, minors included, for their own data.
