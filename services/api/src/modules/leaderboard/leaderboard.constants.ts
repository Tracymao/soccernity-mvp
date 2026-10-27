// sprint-6/leaderboard-read-rollup — Build Plan Section 4.9.
//
// backend/w12-points (B-093): the weekly anti-gaming CAP on engagement points that used to live here
// (ENGAGEMENT_POINTS_CAP_PER_PERIOD = 100, and the list of engagement sources it summed) is REMOVED. It
// was a read-time stand-in for a cap that did not exist at the write side. The spec's caps (Decision Log
// #383: 40 points a day earned for giving, 20 for receiving, Europe/London day) are now enforced when a
// point is AWARDED (points/engagement-points.util.ts), per account and per day, so the rollup simply sums
// the ledger rows that have not been revoked. A weekly cap of 100 would also have contradicted the
// spec's "about 1,800 per month" ceiling.

// Pagination — same deliberate 20/50 default/max every other list
// endpoint in this codebase uses (feed/clubs/grassroots/banter/
// messaging/notifications/community-groups), re-declared locally per
// this codebase's own established "small duplicate over cross-module
// import" convention (see clubs/dto/list-clubs-query.dto.ts's comment).
export const LEADERBOARD_DEFAULT_PAGE_SIZE = 20;
export const LEADERBOARD_MAX_PAGE_SIZE = 50;

// LeaderboardEntry.clubId value for the Overall (global) board (Decision Log #128).
export const GLOBAL_BOARD_CLUB_ID = '';
