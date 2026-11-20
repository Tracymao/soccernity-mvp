import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isAdminChildSafetyVetted } from '../moderation/child-safety-vetting.util';
import { ADMIN_ACTION_LOG_TARGET_TYPES } from './admin-action-log.constants';
import { ADMIN_ACTION_LOG_CHILD_SAFETY_ACTIONS } from './admin-action-log-read.constants';
import { encodeActionLogCursor, parseActionLogQuery, RawActionLogQuery } from './admin-action-log-read.query';

// ---------------------------------------------------------------------------------------------------------------
// GET /admin/action-log (backend/admin-action-log-read; Decision Log #464, option B, founder decision 2026-11-02).
//
//   Scope        A superadmin reads every row (and may filter by acting admin). Every other admin reads ONLY the
//                rows where they are the acting admin: `adminId` is set from the token in parseActionLogQuery and
//                is a condition of the SQL below, so there is no path on which another admin's row can come back.
//   Child safety Applies to EVERY reader, a reader's own rows included, and is decided by a fresh read of
//                AdminUser.childSafetyVetted (isAdminChildSafetyVetted, the one shared rule). For an UNVETTED
//                reader the rows below are left out of the QUERY (not removed after the read), so the page size and
//                the cursor behave exactly as if those rows did not exist: no placeholder, no gap, no count.
//                  1. the actions in ADMIN_ACTION_LOG_CHILD_SAFETY_ACTIONS (guardian notices, date of birth,
//                     incorrect-details resolution), whatever their target;
//                  2. any row whose target is a USER who is a minor (User.isMinor, the media review's own test) or
//                     who cannot be found (fail closed: it cannot be shown that the target is not a minor);
//                  3. any row whose target is a REPORT with concernsMinor (the moderation queue's own test), or a
//                     report that cannot be found (fail closed);
//                  4. any row whose target is a POST MEDIA item whose uploader is a minor, or that cannot be found
//                     (a media item is deleted with its account; fail closed);
//                  5. any row whose target is a CONTACT ENQUIRY escalated into a report with concernsMinor. An
//                     enquiry that cannot be found is NOT hidden: a minor flag exists only on an escalated
//                     enquiry, and an escalated enquiry is never deleted by the 12-month retention job.
//   Notes        Returned exactly as stored.
//   Writes       None. Reading the log does not write a log row.
//
// Raw SQL, not the Prisma query builder: AdminActionLog.targetId is a bare string with no relation, so "the target is
// a minor" cannot be expressed as a Prisma `where`. Every value is a bound parameter.
// ---------------------------------------------------------------------------------------------------------------

export interface ActionLogItem {
  id: string;
  createdAt: Date;
  actor: { id: string; displayName: string };
  action: string;
  targetType: string;
  targetId: string;
  notes: string | null;
}

export interface ActionLogPage {
  items: ActionLogItem[];
  nextCursor: string | null;
}

interface ActionLogRow {
  id: string;
  createdAt: Date;
  adminId: string;
  fullName: string;
  action: string;
  targetType: string;
  targetId: string;
  notes: string | null;
}

const T = ADMIN_ACTION_LOG_TARGET_TYPES;

@Injectable()
export class AdminActionLogReadService {
  constructor(private readonly prisma: PrismaService) {}

  async list(raw: RawActionLogQuery, caller: { sub: string; role: string }): Promise<ActionLogPage> {
    const q = parseActionLogQuery(raw, caller);
    const vetted = await isAdminChildSafetyVetted(this.prisma, caller.sub);

    const conditions: Prisma.Sql[] = [];
    if (q.adminId !== null) conditions.push(Prisma.sql`l."adminId" = ${q.adminId}`);
    if (q.action !== null) conditions.push(Prisma.sql`l."action" = ${q.action}`);
    if (q.from !== null) conditions.push(Prisma.sql`l."createdAt" >= ${q.from}`);
    if (q.toExclusive !== null) conditions.push(Prisma.sql`l."createdAt" < ${q.toExclusive}`);
    if (q.cursor !== null) conditions.push(Prisma.sql`(l."createdAt", l."id") < (${q.cursor.createdAt}, ${q.cursor.id})`);

    if (!vetted) {
      const safetyActions = [...ADMIN_ACTION_LOG_CHILD_SAFETY_ACTIONS];
      conditions.push(Prisma.sql`l."action" <> ALL(${safetyActions})`);
      conditions.push(Prisma.sql`NOT (l."targetType" = ${T.USER} AND NOT EXISTS (
        SELECT 1 FROM "User" u WHERE u."id" = l."targetId" AND u."isMinor" = false))`);
      conditions.push(Prisma.sql`NOT (l."targetType" = ${T.REPORT} AND NOT EXISTS (
        SELECT 1 FROM "Report" r WHERE r."id" = l."targetId" AND r."concernsMinor" = false))`);
      conditions.push(Prisma.sql`NOT (l."targetType" = ${T.POST_MEDIA} AND NOT EXISTS (
        SELECT 1 FROM "PostMedia" m JOIN "User" mu ON mu."id" = m."uploaderId"
        WHERE m."id" = l."targetId" AND mu."isMinor" = false))`);
      // B-037: a profile picture decision is about a PERSON (targetId is their user id): a minor's, or one that no
      // longer exists, is hidden from an admin who is not vetted -- like a user row above.
      conditions.push(Prisma.sql`NOT (l."targetType" = ${T.PROFILE_IMAGE} AND NOT EXISTS (
        SELECT 1 FROM "User" u WHERE u."id" = l."targetId" AND u."isMinor" = false))`);
      conditions.push(Prisma.sql`NOT (l."targetType" = ${T.CONTACT_ENQUIRY} AND EXISTS (
        SELECT 1 FROM "ContactEnquiry" ce JOIN "Report" er ON er."id" = ce."escalatedReportId"
        WHERE ce."id" = l."targetId" AND er."concernsMinor" = true))`);
    }

    const where = conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<ActionLogRow[]>(Prisma.sql`
      SELECT l."id", l."createdAt", l."adminId", a."fullName", l."action", l."targetType", l."targetId", l."notes"
      FROM "AdminActionLog" l
      JOIN "AdminUser" a ON a."id" = l."adminId"
      ${where}
      ORDER BY l."createdAt" DESC, l."id" DESC
      LIMIT ${q.limit + 1}`);

    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        actor: { id: r.adminId, displayName: r.fullName },
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        notes: r.notes,
      })),
      nextCursor: hasMore && last ? encodeActionLogCursor({ createdAt: last.createdAt, id: last.id }) : null,
    };
  }
}
