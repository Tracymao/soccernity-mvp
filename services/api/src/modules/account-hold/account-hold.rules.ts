import { Prisma } from '@prisma/client';
import { addDays, addUtcMonths, HoldRuleConfig } from './account-hold.config';

// backend/w6-hold-rule-extension (B-044; Decision Log #376, extends #341 / #345).
//
// WHY AN ACCOUNT IS HELD, in one place. Erasure of a pending_deletion account is paused while:
//   open_report    a report involving it is open (or reopened by an overturned appeal);
//   appeal_window  the report was actioned and the appeal window is still running, or an appeal is pending;
//   post_closure   the report closed and the post-closure months have not yet passed;
//   legal_hold     an admin placed a legal hold (until lifted);
//   bad_faith      an admin found the account's report was made in bad faith (for BAD_FAITH_HOLD_MONTHS).
// legal_hold and bad_faith are AccountHold rows ("admin holds": the account is held IN FULL, nothing is
// cleared). The first three are DERIVED from Report ("report holds": the account gets minimised, see
// AccountDeletionSweepService.minimiseHeldUser).

export type ReportHoldType = 'open_report' | 'appeal_window' | 'post_closure';
export type AdminHoldType = 'legal_hold' | 'bad_faith';
export type HoldType = ReportHoldType | AdminHoldType;

export const ADMIN_HOLD_TYPES: readonly AdminHoldType[] = ['legal_hold', 'bad_faith'];
export function isAdminHoldType(t: string): t is AdminHoldType {
  return (ADMIN_HOLD_TYPES as readonly string[]).includes(t);
}

// Strongest first. Used to pick the ONE type reported for an account held by several things at once.
export const HOLD_TYPE_PRECEDENCE: readonly HoldType[] = [
  'legal_hold',
  'bad_faith',
  'open_report',
  'appeal_window',
  'post_closure',
];
export function strongestHoldType(types: readonly HoldType[]): HoldType | null {
  for (const t of HOLD_TYPE_PRECEDENCE) if (types.includes(t)) return t;
  return null;
}

export interface ReportClosureInput {
  status: string;
  appealStatus: string | null;
  reviewedAt: Date | null;
  appealReviewedAt: Date | null;
}

/**
 * THE closure moment of a report, or null while it is not closed. The one predicate the sweep, the
 * stalled-holds list and the appeal-window check all use.
 *   dismissed ('reviewed')                  -> reviewedAt
 *   actioned, no appeal                     -> reviewedAt + the appeal window
 *   actioned, appeal 'upheld'               -> appealReviewedAt
 *   open (incl. reopened by an overturned appeal), actioned with an appeal still pending -> null (not closed)
 * Anything unrecognised, or a closed state missing its timestamp, is null: FAIL SAFE (held).
 */
export function reportClosedAt(r: ReportClosureInput, appealWindowDays: number): Date | null {
  if (r.status === 'reviewed') return r.reviewedAt;
  if (r.status === 'actioned') {
    if (r.appealStatus === null) return r.reviewedAt ? addDays(r.reviewedAt, appealWindowDays) : null;
    if (r.appealStatus === 'upheld') return r.appealReviewedAt;
    return null; // 'pending' (and anything unexpected)
  }
  return null; // 'open' and anything unrecognised
}

/** True once the appeal window of an actioned, un-appealed report has lapsed (`now` is the first lapsed instant). */
export function appealWindowLapsed(reviewedAt: Date, appealWindowDays: number, now: Date): boolean {
  return now.getTime() >= addDays(reviewedAt, appealWindowDays).getTime();
}

export interface InvolvedReport extends ReportClosureInput {
  /** The account is the reporter. */
  isReporter: boolean;
  /** The account is the reported user, or the author of the reported post / comment. */
  isSubject: boolean;
}

function stageOf(r: ReportClosureInput): 'open_report' | 'appeal_window' {
  return r.status === 'actioned' ? 'appeal_window' : 'open_report';
}

/**
 * The report-based hold one report places on an account, or null. A held account stays held while:
 *   REPORTED person / author of reported content: the report is not closed, or closed less than
 *     `postClosureMonths` ago. (Held while now < closure + months; the release instant itself is free.)
 *   REPORTER: only while the report is open or its appeal is pending, never afterwards (bad faith is an
 *     AccountHold, not this rule).
 */
export function reportHoldType(r: InvolvedReport, now: Date, cfg: HoldRuleConfig): ReportHoldType | null {
  const found: ReportHoldType[] = [];

  if (r.isSubject) {
    const closure = reportClosedAt(r, cfg.appealWindowDays);
    if (closure === null) {
      found.push(stageOf(r));
    } else if (now.getTime() < closure.getTime()) {
      found.push('appeal_window'); // actioned, no appeal yet, window still running
    } else if (now.getTime() < addUtcMonths(closure, cfg.postClosureMonths).getTime()) {
      found.push('post_closure');
    }
  }

  if (r.isReporter) {
    const open = r.status === 'open';
    const inAppeal = r.status === 'actioned' && r.appealStatus === 'pending';
    if (open) found.push('open_report');
    else if (inAppeal) found.push('appeal_window');
  }

  return strongestHoldType(found) as ReportHoldType | null;
}

/** The strongest report-based hold across every report involving an account. */
export function strongestReportHold(reports: readonly InvolvedReport[], now: Date, cfg: HoldRuleConfig): ReportHoldType | null {
  const types: ReportHoldType[] = [];
  for (const r of reports) {
    const t = reportHoldType(r, now, cfg);
    if (t) types.push(t);
  }
  return strongestHoldType(types) as ReportHoldType | null;
}

// ---- reads ----

type Db = Pick<Prisma.TransactionClient, '$queryRaw' | 'accountHold'>;

interface InvolvedReportRow {
  status: string;
  appealStatus: string | null;
  reviewedAt: Date | null;
  appealReviewedAt: Date | null;
  isReporter: boolean;
  isSubject: boolean;
}

/**
 * Every report involving the account, with how it is involved. Raw SQL because Prisma's query builder
 * cannot express the per-targetType correlated EXISTS (Report.targetId is a bare string; the post and
 * comment cases join through Post / Comment.authorId, Decision Log #341). "Involved" is unchanged from the
 * old hasOpenInvestigation: reporter; target is the user; target is a post or comment they authored.
 * This only GATHERS; whether a row is a hold is decided by reportHoldType, in one place.
 */
export async function findInvolvedReports(db: Pick<Prisma.TransactionClient, '$queryRaw'>, userId: string): Promise<InvolvedReport[]> {
  const rows = await db.$queryRaw<InvolvedReportRow[]>`
    SELECT r."status", r."appealStatus", r."reviewedAt", r."appealReviewedAt",
      (r."reporterId" = ${userId}) AS "isReporter",
      (
        (r."targetType" = 'user' AND r."targetId" = ${userId})
        OR (r."targetType" = 'post' AND EXISTS (
              SELECT 1 FROM "Post" p WHERE p."id" = r."targetId" AND p."authorId" = ${userId}))
        OR (r."targetType" = 'comment' AND EXISTS (
              SELECT 1 FROM "Comment" c WHERE c."id" = r."targetId" AND c."authorId" = ${userId}))
      ) AS "isSubject"
    FROM "Report" r
    WHERE r."reporterId" = ${userId}
      OR (r."targetType" = 'user' AND r."targetId" = ${userId})
      OR (r."targetType" = 'post' AND EXISTS (
            SELECT 1 FROM "Post" p WHERE p."id" = r."targetId" AND p."authorId" = ${userId}))
      OR (r."targetType" = 'comment' AND EXISTS (
            SELECT 1 FROM "Comment" c WHERE c."id" = r."targetId" AND c."authorId" = ${userId}))
  `;
  return rows.map((r) => ({
    status: r.status,
    appealStatus: r.appealStatus,
    reviewedAt: r.reviewedAt,
    appealReviewedAt: r.appealReviewedAt,
    isReporter: Boolean(r.isReporter),
    isSubject: Boolean(r.isSubject),
  }));
}

export interface ActiveAccountHold {
  id: string;
  type: AdminHoldType;
  reportId: string | null;
  expiresAt: Date | null;
}

/** An admin hold in force right now (not lifted, not expired), the strongest first (legal before bad faith). */
export async function findActiveAccountHold(
  db: Pick<Db, 'accountHold'>,
  userId: string,
  now: Date,
): Promise<ActiveAccountHold | null> {
  const rows = await db.accountHold.findMany({
    where: { userId, liftedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    select: { id: true, type: true, reportId: true, expiresAt: true },
  });
  const legal = rows.find((r) => r.type === 'legal_hold');
  const chosen = legal ?? rows.find((r) => r.type === 'bad_faith');
  if (!chosen || !isAdminHoldType(chosen.type)) return null;
  return { id: chosen.id, type: chosen.type, reportId: chosen.reportId, expiresAt: chosen.expiresAt };
}

export interface ResolvedHold {
  type: HoldType;
  /** 'admin' = an AccountHold row (held in full); 'report' = derived from Report (minimised). */
  kind: 'admin' | 'report';
  /** backend/b045-held-list-hold-ids: the AccountHold id when kind is 'admin' (the one `type` comes from), else null. */
  holdId: string | null;
  /** That AccountHold's reportId when kind is 'admin' (may itself be null), else null. */
  reportId: string | null;
}

/**
 * Whether, and why, an account is held right now. Admin holds win (they hold in full); otherwise the
 * strongest report-based hold. The ONE read the sweep, the stalled-holds list and the immediate-delete
 * check go through.
 */
export async function resolveAccountHold(db: Db, userId: string, now: Date, cfg: HoldRuleConfig): Promise<ResolvedHold | null> {
  const admin = await findActiveAccountHold(db, userId, now);
  if (admin) return { type: admin.type, kind: 'admin', holdId: admin.id, reportId: admin.reportId };
  const reports = await findInvolvedReports(db, userId);
  const type = strongestReportHold(reports, now, cfg);
  return type ? { type, kind: 'report', holdId: null, reportId: null } : null;
}
