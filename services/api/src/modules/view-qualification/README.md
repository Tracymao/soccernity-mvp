# view-qualification

Build target: **backend/w12-points** (B-093), Decision Log #384; `docs/contest-spec.md` sections 9c and 13
("server-validated playback and dwell heartbeats for view qualification, client-reported watch time alone
is spoofable").

## What it does

`POST /posts/:id/view-heartbeat` (`JwtAuthGuard` only) lets a client report that a post is on screen. When
the **server-credited** time meets a threshold it fires the outcome once:

1. the **baseline view point** (the viewer 1 point, the creator 0.25) through the points engine
   (`points/README.md`), and
2. for a weeks-1-3 **contest entry** whose counting window is open, the **contest view**
   (`ContestEngagement` kind `view`, through `recordQualifiedView`), which Phase 1 ranking reads, so Phase 1
   now ranks on views + likes + comments as spec section 7 says.

It does **not** replace `POST /posts/:id/view`, the anonymous display-count tally: a view shown as a number
and a view that earns a point are different things (spec 9c). Looking at a post is not a social write, so the
route carries no consent or email guard; a restricted or unverified account may read, and simply earns
nothing.

## Thresholds (`view-thresholds.util.ts`)

| | Baseline | Contest tally (weeks 1-3) |
|---|---|---|
| Photo | 3 s on screen | 5 s |
| Text-only | 3 s visible | 5 s (**adopted default**: the spec names only video and photo) |
| Video | full length if under 60 s, else 60 s | min(video length, the round's `viewWatchLimitSeconds` L) |
| Week-4 final | n/a | **views are not counted** |

"Watched" is active playback while visible and in the foreground; muted autoplay counts (mute is neither
sent nor stored); skipping ahead earns no credit; a loop counts once. The server decides the media kind from
the post (`Post.mediaUrls`, extension heuristic, the same one `apps/web` uses), never from the client.

## How the server keeps the clock (`view-session.util.ts`)

The client sends beats `{ sessionId, active, positionSeconds?, durationSeconds? }` about every 3 seconds
(`HEARTBEAT_INTERVAL_SECONDS`). It never sends "seconds watched". Credit for the gap between two beats is
what the **server** measured, and only if both beats were `active`:

- a gap longer than 6 s earns nothing (one missed beat is forgiven, a silence is not);
- a **video** also needs the playhead to have advanced: a paused video earns nothing, a rewind or loop
  restart earns nothing for that gap, a jump forward faster than 2x playback (a skip) earns nothing;
- ten beats in one instant earn at most that instant; sessions are bound to `(viewer, post, sessionId)` so
  another account cannot reuse an id; two simultaneous beats for one session are not both credited
  (a short Redis lock; the second is ignored); a per-viewer ceiling of 240 beats a minute returns 429.

**What this cannot prove:** a determined client can send `active: true` with a moving playhead for a muted,
off-screen video, and the **claimed video length is unverifiable** (the server cannot open an arbitrary media
URL). The server bounds the cost, it does not remove it: real elapsed time is always required (a view takes
at least its threshold in wall-clock time), the minimum for any view is 1 s whatever length is claimed, one
point per account per post, and the 40-point daily cap on giving.

## What is stored about the viewer (for the DPIA drafter)

| Where | What | How long | Who can read it |
|---|---|---|---|
| Redis `viewhb:s:<viewerId>:<postId>:<sessionId>` | last beat time, last `active` flag, last playhead position (video), credited seconds, two "done" flags | expires **120 s** after the last beat | the API process only |
| Redis `viewhb:rate:<viewerId>` | a beat counter | **60 s** window | the API process only |
| Redis `viewhb:lock:<session key>` | a lock | 5 s | the API process only |
| Postgres `PointsLedgerEntry`, **only when a threshold is met** | viewer's row (`engagement_view_given`) and the creator's (`engagement_view_received`): user, post, counterpart, quarter points, time, represented-club snapshot, `revokedAt` | append-only; **no retention period is defined yet** (open) | database operators; no endpoint returns another user's rows; the leaderboard shows aggregates only |
| Postgres `ContestEngagement`, **only for a contest entry when the contest threshold is met** | entry, viewer, kind `view`, whether the viewer followed the creator at that moment, time | with the entry; **no retention period defined yet** (open) | database operators; the contest endpoints return tallies, not the log |

**Never stored:** dwell seconds, playhead, session id, IP address, user agent, device, mute state, scroll
position, viewport. The same pipeline applies to minors (the founder said "same rules for minors"); it is new
processing of children's data and has not been reviewed by counsel (`docs/contest-spec.md` open item 8).

## Files

`view-qualification.controller.ts`, `view-qualification.service.ts`, `view-qualification.module.ts`,
`dto/view-heartbeat.dto.ts`, `view-thresholds.util.ts`, `view-session.util.ts`, and their specs. The
real-Postgres, real-Redis behaviour is `test/points-engine.e2e-spec.ts`.

## Not built

`apps/web` does not send heartbeats yet (the client side of B-093 / B-098).
