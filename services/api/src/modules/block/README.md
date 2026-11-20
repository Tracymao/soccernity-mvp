# Block (B-039)

`backend/w5-profile-block`. Decision Log #396 (C1, C2), #402 (item 4), #403 (item 16), #404 (items 8, 11), #405, #406 (item 12). Build register B-039 (frontend: B-108, B-082).

## What it is

One model, `Block` (`blockerId`, `blockedId`, optional `reason`, `createdAt`, monotonic `sequence`), unique on `(blockerId, blockedId)`. Migration `20261020151920_add_profile_fields_avatar_and_block` (additive; rollback notes are in the migration header). Both user FKs are RESTRICT, like `Follow` (#341: the `User` row is anonymized in place, never deleted); `AccountDeletionSweepService.anonymizeUser` deletes every Block the user is part of, in both directions.

## Endpoints (all under `/users`, `JwtAuthGuard`)

| Route | Guards | Behaviour |
|---|---|---|
| `POST /users/:id/block` `{ reason? }` | authentication only | 200 `{ userId, blocked: true }`. One transaction: writes the row and removes follows **in both directions**. Idempotent; the first reason stands (not editable: unblock and re-block). Target must be a profile the blocker could see (active, not restricted-pending), else 404. Self 400. |
| `DELETE /users/:id/block` | authentication only | 200 `{ userId, blocked: false }`. No-op when not blocked (never a 404). Does **not** restore follows (#402). |
| `GET /users/:id/blocks` | — (self only, else 403) | The blocker's own list, newest first: `{ id, publicName, reason }`, **no date**. Keyset by `sequence`; the cursor carries only the sequence (a `createdAt` in a decodable cursor would leak the date). |

**Guards (B-197, Decision Log #411 item 5, `backend/w6-username-cover-block`):** block, unblock and the blocked list need **authentication only**. `GuardianConsentGuard` and `EmailVerifiedGuard` were removed from both write routes (W5 had put Consent on both and EmailVerified on the creating form), so a restricted-pending minor or an unverified account can still block someone. This amends how #370's uniform write block applied to Block. `write-route-guards.spec.ts` now lists both routes under OPEN_ROUTES and a dedicated test pins that `JwtAuthGuard` stays and that no handler carries a consent or email guard. The *target* rules are unchanged (a hidden or restricted-pending target is still the plain 404).

## Where it is enforced

The helpers in `block.util.ts` are pure (`notBlockedWith(viewerId)`, `blockedPairWhere`, `relationFromRows`), so a new endpoint adopts the rule with one clause and no module import.

| Surface | Rule |
|---|---|
| `GET /posts/feed`, `/clubs/:id/feed`, `/banter-rooms/:id/posts` | posts by a user blocked in either direction are not returned |
| `GET /posts/:id`, like, comment, save, view, `GET /posts/:id/comments` | the post is the plain 404 (undo forms unlike/unsave stay open) |
| comment lists | comments by a blocked user are hidden from the viewer; `commentCount` is **not** adjusted |
| saved posts | hidden while blocked (the `SavedPost` row is kept) |
| `GET /search` (users, posts) | `SearchController` reads the token **optionally** (still public); a logged-in caller's blocks apply |
| club and Community Group rosters, followers/following lists, `GET /users/suggested` | blocked pair hidden from the viewer; member counts unchanged |
| `POST /users/:id/follow` | blocked user → same 404 as a missing user; the blocker → 403 `you_blocked_this_user` |
| `POST /conversations`, `POST /conversations/:id/messages` | same split. Decided **after** the age/consent rules (they apply first, #404 item 11). The block read is part of the fixed set of reads every start-conversation attempt does (timing parity, #350). |
| `GET /users/:id/public-profile` | the blocked user gets the same 404 as a non-existent profile (same class, status, body); the blocker still reaches it (`viewerHasBlocked: true`) |
| leaderboard | **unaffected** (#402) |

| Notifications (B-197) | **No new row** is created where actor and recipient have a Block between them (either direction): follow, like, comment, message, fixture_scheduled, result_logged (`hasBlockBetween`, checked inside each trigger's transaction, so the action itself still succeeds). **Existing** rows between the pair are hidden from both sides' `GET /notifications`, the unread count, `PATCH /notifications/read-all` (hidden rows are left unread and uncounted) and `PATCH /notifications/:id/read` (404). Hiding is at read time, so the rows reappear if the Block is removed. See `notifications/block-visibility.util.ts`. |

A block never reveals itself: no response, count or error tells the blocked user; the only distinct answer (`403 you_blocked_this_user`) is one only the blocker can receive.

## Not decided / not built (OPEN)

- Whether the blocker should see a 403 or the same 404 on follow/message attempts (a coded 403 was chosen: they know, and "Unblock them to do that" is actionable).
- Whether a blocked pair's existing DM thread disappears from either inbox (it stays listed, history readable).
- Bants room listing is unaffected (decided, #411 item 5); the Contest page and contest winners lists are unaffected (decided: names are still listed, a tap on a blocker's name opens the generic not-found).
- **Existing `like` and `comment` notification rows cannot be hidden**: a `Notification` stores no actor for those two types (`payloadRefId` is the post), so a row cannot be attributed to a person. The fix is an `actorId` column on `Notification`, which is not decided. They render as "Someone" and name no one. `moderation_decision`, `contest_*`, `age_milestone` and `match_kickoff` rows have no user actor and are not touched.
- Whether hidden notification rows should be deleted instead of hidden (adopted default: hidden at read time).
- Like identities: no list exists anywhere, so the "like identities" clause hides nothing today (recorded as an interpretation in #404).
