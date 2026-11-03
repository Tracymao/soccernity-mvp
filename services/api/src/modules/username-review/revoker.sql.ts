import { Prisma } from '@prisma/client';
import { ADMIN_ACTION_LOG_ACTIONS, ADMIN_ACTION_LOG_TARGET_TYPES } from '../admin-action-log/admin-action-log.constants';

// WHO revoked a username, as one SQL expression over a "RevokedUsername" row aliased `rv`. This is the single
// definition used by the list, the decide check and the tests, so "the revoking admin" means the same thing
// everywhere.
//
//   1. RevokedUsername.revokedByAdminId, set by the revoke service from backend/b139-username-review on.
//   2. For rows written BEFORE that column existed (it is NULL, no backfill): the AdminActionLog row the revoke
//      wrote in the same transaction ('user.username_revoked', targetType 'user', targetId = the user, notes
//      starting "username=<handle>;"). When the same handle was revoked more than once for one user the log has
//      several such rows; the latest one written at or before the record's own revokedAt (+1 minute of slack,
//      because the log row's timestamp is set by the database a few milliseconds after revokedAt) is the one that
//      belongs to this record. starts_with() rather than LIKE: a handle may contain '_', a LIKE wildcard.
//   3. If neither exists the revoker is unknown (NULL). The rule "a different admin decides" then cannot exclude
//      anyone (adopted default, veto-able: failing closed would strand the request with nobody able to decide it).
export const REVOKER_ID_SQL = Prisma.sql`COALESCE(
  rv."revokedByAdminId",
  (SELECT l."adminId"
     FROM "AdminActionLog" l
    WHERE l."action" = ${ADMIN_ACTION_LOG_ACTIONS.USER_USERNAME_REVOKED}
      AND l."targetType" = ${ADMIN_ACTION_LOG_TARGET_TYPES.USER}
      AND l."targetId" = rv."userId"
      AND starts_with(l."notes", 'username=' || rv."username" || ';')
      AND l."createdAt" <= rv."revokedAt" + interval '1 minute'
    ORDER BY l."createdAt" DESC
    LIMIT 1)
)`;
