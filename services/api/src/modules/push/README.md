# push (web push, B-285)

Opt-in browser notifications. Decision Log #472 adopted default (e); build register B-285. **Backend only**: the
browser-permission prompt and the service worker are a web PR, not here. Default off: a person is never subscribed
unless their browser sends a subscription to the route below.

## What a push says

Always exactly `{"title":"Soccernity","body":"You have a new notification"}`. Nothing about the notification's content,
names, ids or type ever goes in a push (a pushed text can show on a locked screen). The text lives in
`push.constants.ts` and a unit and an e2e test fail if anything else appears.

## Configuration

`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (a `mailto:` or `https://` contact address). The founder generates
the key pair once with `npx web-push generate-vapid-keys`. All three are in `.env.example` and in both `render.yaml`
services (`sync: false`). Unset, blank, `replace-me`, or a subject that is not `mailto:` / `https://` means **the
feature reports itself unavailable**: nothing else breaks, the sweep does nothing, and no test needs real keys.

## Routes (`JwtAuthGuard` only, self-scoped, no `:id`)

| Route | Answer |
| --- | --- |
| `GET /notification-settings/push` | `{ available: true, publicKey }` or `{ available: false }` (the PUBLIC key only) |
| `POST /notification-settings/push/subscription` `{ endpoint, keys: { p256dh, auth } }` | `200 { subscribed: true }`; idempotent on the endpoint (one row per browser, keys refreshed) |
| `DELETE /notification-settings/push/subscription` `{ endpoint }` | `204`; deletes only the caller's own row, quiet if there is none |

With the keys unset, POST and DELETE answer `503 { code: "push_not_configured" }`. An endpoint that is not an https address
on a known browser push service is `400 { code: "push_endpoint_not_accepted" }` (see Defaults). The routes are in
`write-route-guards.spec.ts`'s `OPEN_ROUTES`: they only turn on a channel for the person's OWN browser, so a restricted-pending or
unverified account may use them.

## The sweep (`PushSweepService`, every minute)

The thirteen places that write a `Notification` row are **not touched**; a per-minute `@Cron` sweep sends the push. The
trade-off is a delay of **up to one minute** between a notification and its push.

1. Find rows with `pushSentAt` NULL, created in the last 10 minutes, whose owner has at least one subscription.
2. Per user: **claim** the rows (`updateMany ... pushSentAt NULL -> now`, so two API instances never send the same push), then send
   ONE push to each of the user's subscriptions, however many rows were waiting.
3. A `404` or `410` from the push service deletes that subscription. Any other failure keeps it. If **every** send failed for
   a transient reason the claim is released and the next run retries (until the rows leave the 10-minute window).
4. A failure never throws out of the sweep; only counts and status codes are logged, never an endpoint, key or payload.

A notification the B-062 preference rule suppresses is never stored, so it never reaches this sweep; nothing here re-checks it.

## Data

* `PushSubscription` (`id`, `userId` FK CASCADE, `endpoint` unique, `p256dh`, `auth`, `createdAt`): a genuine addition beyond
  Section 3's entity list, flagged as a Decision Log candidate. Credential-like: never returned, never logged. Deleted by the
  anonymiser (and held-account minimisation) and classified in `anonymized-row-purge.references.ts`.
* `Notification.pushSentAt`: nullable; never selected into any API payload.
* Migration `20261120090000_add_push_subscription` (additive, rollback in its header).

## Defaults, founder-veto-able

The founder did not state these; each is marked in the code.

* Only push-service hosts the browsers use are accepted as endpoints (`PUSH_ENDPOINT_HOST_SUFFIXES`: FCM, Mozilla, WNS, Apple),
  https on the default port. A stored endpoint is an address this server later posts to, so accepting any https address
  would be a request-forgery hole. A new browser vendor's push host has to be added to that list.
* The same browser subscribing under a different account moves the row to the new account.
* 10-minute window, 10-minute push TTL, at most 5,000 rows read per run, `urgency: normal`.
* A subscription created after a notification still gets the push if the notification is inside the 10-minute window.
* A notification already marked read is still pushed (the sweep does not look at `read`).

## Not built

The service-worker and permission code; a settings screen; per-type push preferences; any push content beyond the generic line.
