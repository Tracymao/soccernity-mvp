import { Prisma } from '@prisma/client';
import { londonParts, londonWallTimeToUtc } from '../contest-notifications/contest-calendar.util';
import { CONTEST_ELIGIBLE_USER } from '../contest/contest-eligibility';
import { PointsCaps } from './points-config.service';
import {
  BASELINE_ENGAGEMENT_SOURCES,
  EngagementPointKind,
  GIVEN_SOURCES,
  GIVER_QUARTERS_PER_ENGAGEMENT,
  RECEIVED_SOURCES,
  RECEIVER_QUARTERS_PER_ENGAGEMENT,
  givenSourceFor,
  receivedSourceFor,
} from './points.constants';

// backend/w12-points (B-093; Decision Log #382, #383; docs/contest-spec.md sections 9a, 9b).
// The baseline leaderboard-points engine: everyday views, likes and comments, outside any contest.
//
//   GIVER    earns 1 point (4 units) per qualifying view / like / comment per unique post.
//   CREATOR  earns 0.25 point (1 unit) per qualifying view / like / comment per unique ACCOUNT per post.
//   Self-engagement is exempt. A verified email is required and restricted accounts never earn.
//   Daily caps (Europe/London calendar day): 40 points given, 20 points received (configuration).
//   Revocation: an unlike, a removed comment, a removed post, or an account later restricted marks the
//   row revoked; a revoked row counts for nothing, and so frees that day's cap. A removed-then-restored
//   engagement clears the mark, so it earns its point once.
//   FOLLOWS AND POSTS EARN NOTHING (B-094): there is no engagement kind for them.
//
// Plain functions that take a transaction client, like points.util.ts and for the same reason: FeedService
// writes the Like / Comment and the points must land atomically in THAT transaction.
//
// Contest tallies are separate (ContestEngagement) and are not affected by anything here: the 0.25
// rule "applies ONLY to baseline leaderboard points and never affects contest or competition tallies".
// A like on a contest entry still earns the ordinary baseline points (the like is still a like).

export type AwardOutcome =
  | 'awarded' // a new ledger row was written
  | 'restored' // a revoked row was brought back
  | 'duplicate' // already earned (and not revoked): nothing to do
  | 'capped' // the daily cap is reached: nothing written, and not queued
  | 'ineligible' // the account may not earn (not verified / restricted / not active)
  | 'self'; // self-engagement is exempt

export interface EngagementAwardResult {
  giver: AwardOutcome;
  receiver: AwardOutcome;
}

export interface EngagementInput {
  kind: EngagementPointKind;
  postId: string;
  /** The creator of the post: the receiver of the 0.25. */
  postAuthorId: string;
  /** The account that viewed / liked / commented: the giver. */
  giverId: string;
}

type Db = Pick<Prisma.TransactionClient, 'pointsLedgerEntry' | 'user' | '$executeRaw'>;

// ---- London day ----------------------------------------------------------------------------------

/** [start, end) of the Europe/London calendar day containing `instant`, as UTC instants, and its key. */
export function londonDayBounds(instant: Date): { start: Date; end: Date; key: string } {
  const p = londonParts(instant);
  const start = londonWallTimeToUtc(p.year, p.month, p.day);
  // Date.UTC rolls the day over a month / year end for us; only the Y-M-D of the result is used.
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  const end = londonWallTimeToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  const key = `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  return { start, end, key };
}

// ---- refIds ---------------------------------------------------------------------------------------

/** A RECEIVED row is keyed per unique giving account, so a creator earns 0.25 per account per post. */
export function receivedRefId(postId: string, giverId: string): string {
  return `${postId}:${giverId}`;
}

// ---- the cap lock ----------------------------------------------------------------------------------

// The cap is a read-then-write ("how much today? then add"), so two concurrent awards for the same
// account and day could both read "room left". A transaction-scoped advisory lock per (side, account,
// day) serialises them; it is released with the transaction. The locks are taken in sorted order so two
// transactions that each need two of them can never wait on each other in a cycle.
async function lockCapKeys(db: Db, keys: string[]): Promise<void> {
  for (const key of [...keys].sort()) {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }
}

async function usedToday(
  db: Db,
  userId: string,
  sources: readonly string[],
  day: { start: Date; end: Date },
): Promise<number> {
  const agg = await db.pointsLedgerEntry.aggregate({
    _sum: { quarterPoints: true },
    where: {
      userId,
      source: { in: [...sources] },
      revokedAt: null,
      occurredAt: { gte: day.start, lt: day.end },
    },
  });
  return agg._sum.quarterPoints ?? 0;
}

// ---- award -----------------------------------------------------------------------------------------

interface SideInput {
  userId: string;
  source: string;
  refId: string;
  postId: string;
  counterpartId: string | null;
  amount: number;
  capQuarters: number;
  capSources: readonly string[];
  clubId: string | null;
}

async function awardSide(db: Db, side: SideInput, now: Date, day: { start: Date; end: Date }): Promise<AwardOutcome> {
  const existing = await db.pointsLedgerEntry.findUnique({
    where: { source_refId_userId: { source: side.source, refId: side.refId, userId: side.userId } },
    select: { id: true, revokedAt: true },
  });
  if (existing && existing.revokedAt === null) return 'duplicate';

  const used = await usedToday(db, side.userId, side.capSources, day);
  if (used + side.amount > side.capQuarters) return 'capped';

  if (existing) {
    // Removed and then restored: the same engagement, earning its point once. It counts toward today,
    // so it is dated now and re-snapshots the represented club.
    await db.pointsLedgerEntry.update({
      where: { id: existing.id },
      data: { revokedAt: null, occurredAt: now, clubId: side.clubId, quarterPoints: side.amount },
    });
    return 'restored';
  }

  const result = await db.pointsLedgerEntry.createMany({
    data: [
      {
        userId: side.userId,
        source: side.source,
        refId: side.refId,
        quarterPoints: side.amount,
        postId: side.postId,
        counterpartId: side.counterpartId,
        clubId: side.clubId,
        occurredAt: now,
      },
    ],
    skipDuplicates: true,
  });
  return result.count > 0 ? 'awarded' : 'duplicate';
}

/**
 * Awards the baseline points for ONE qualifying engagement: the giver's point and the creator's quarter
 * point. Idempotent per (kind, post, giver). Call it only when the engagement qualifies -- a like that
 * was just created, a comment that passed the content screening, a view that met its threshold.
 */
export async function awardEngagementPoints(
  db: Db,
  input: EngagementInput & { now: Date; caps: PointsCaps },
): Promise<EngagementAwardResult> {
  if (input.giverId === input.postAuthorId) {
    return { giver: 'self', receiver: 'self' };
  }

  // Who may earn is read now, not remembered: an account restricted or deactivated since stops earning.
  // The engagement itself must come from an eligible account for EITHER side to count ("accounts
  // without a verified email never count; restricted accounts never earn").
  const eligible = await db.user.findMany({
    where: { id: { in: [input.giverId, input.postAuthorId] }, ...CONTEST_ELIGIBLE_USER },
    select: { id: true, representedClubId: true },
  });
  const giver = eligible.find((u) => u.id === input.giverId);
  const author = eligible.find((u) => u.id === input.postAuthorId);
  if (!giver) return { giver: 'ineligible', receiver: 'ineligible' };

  const day = londonDayBounds(input.now);
  await lockCapKeys(db, [
    `points-cap:given:${input.giverId}:${day.key}`,
    ...(author ? [`points-cap:received:${input.postAuthorId}:${day.key}`] : []),
  ]);

  const giverOutcome = await awardSide(
    db,
    {
      userId: input.giverId,
      source: givenSourceFor(input.kind),
      refId: input.postId,
      postId: input.postId,
      counterpartId: null,
      amount: GIVER_QUARTERS_PER_ENGAGEMENT,
      capQuarters: input.caps.givenQuarters,
      capSources: GIVEN_SOURCES,
      clubId: giver.representedClubId,
    },
    input.now,
    day,
  );

  let receiverOutcome: AwardOutcome = 'ineligible';
  if (author) {
    receiverOutcome = await awardSide(
      db,
      {
        userId: input.postAuthorId,
        source: receivedSourceFor(input.kind),
        refId: receivedRefId(input.postId, input.giverId),
        postId: input.postId,
        counterpartId: input.giverId,
        amount: RECEIVER_QUARTERS_PER_ENGAGEMENT,
        capQuarters: input.caps.receivedQuarters,
        capSources: RECEIVED_SOURCES,
        clubId: author.representedClubId,
      },
      input.now,
      day,
    );
  }
  return { giver: giverOutcome, receiver: receiverOutcome };
}

// ---- revoke ----------------------------------------------------------------------------------------

type RevokeDb = Pick<Prisma.TransactionClient, 'pointsLedgerEntry'>;

/**
 * An engagement was removed (an unlike; the account's last visible comment removed): revokes the
 * giver's row and the creator's row for it. Safe to call when nothing was ever earned (a capped or
 * ineligible engagement left no row).
 */
export async function revokeEngagementPoints(db: RevokeDb, input: EngagementInput & { now: Date }): Promise<void> {
  await db.pointsLedgerEntry.updateMany({
    where: {
      OR: [
        { source: givenSourceFor(input.kind), refId: input.postId, userId: input.giverId },
        {
          source: receivedSourceFor(input.kind),
          refId: receivedRefId(input.postId, input.giverId),
          userId: input.postAuthorId,
        },
      ],
      revokedAt: null,
    },
    data: { revokedAt: input.now },
  });
}

/** The post was removed: every baseline row earned on it, by anyone, is revoked. */
export async function revokeEngagementPointsForPost(db: RevokeDb, postId: string, now: Date): Promise<number> {
  const result = await db.pointsLedgerEntry.updateMany({
    where: { postId, source: { in: [...BASELINE_ENGAGEMENT_SOURCES] }, revokedAt: null },
    data: { revokedAt: now },
  });
  return result.count;
}

/**
 * The account was later restricted (consent refused or withdrawn, suspended): everything it earned, and
 * everything it earned OTHER accounts by engaging with them, is revoked. Placement prizes are not
 * touched. Not undone automatically when a restriction lifts (an adopted default, see the report).
 */
export async function revokeEngagementPointsForAccount(
  db: RevokeDb,
  userId: string,
  now: Date,
): Promise<number> {
  const result = await db.pointsLedgerEntry.updateMany({
    where: {
      source: { in: [...BASELINE_ENGAGEMENT_SOURCES] },
      revokedAt: null,
      OR: [{ userId }, { counterpartId: userId }],
    },
    data: { revokedAt: now },
  });
  return result.count;
}
