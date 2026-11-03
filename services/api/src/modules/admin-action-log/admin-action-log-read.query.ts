import { BadRequestException } from '@nestjs/common';
import {
  ADMIN_ACTION_LOG_ACTION_INVALID_CODE,
  ADMIN_ACTION_LOG_ACTION_VALUES,
  ADMIN_ACTION_LOG_ADMIN_FILTER_NOT_ALLOWED_CODE,
  ADMIN_ACTION_LOG_ADMIN_ID_INVALID_CODE,
  ADMIN_ACTION_LOG_CURSOR_INVALID_CODE,
  ADMIN_ACTION_LOG_DATE_INVALID_CODE,
  ADMIN_ACTION_LOG_DEFAULT_PAGE_SIZE,
  ADMIN_ACTION_LOG_LIMIT_INVALID_CODE,
  ADMIN_ACTION_LOG_MAX_PAGE_SIZE,
  ADMIN_ACTION_LOG_RANGE_INVALID_CODE,
  ADMIN_ACTION_LOG_READ_ALL_ROLE,
} from './admin-action-log-read.constants';

// Parsing and validation for GET /admin/action-log. Every value arrives as a plain optional string (the DTO does no
// validation of its own) so that EVERY rejection carries a stable `code`, the way GET /admin/search does.

export interface ActionLogCursor {
  createdAt: Date;
  id: string;
}

export interface ParsedActionLogQuery {
  limit: number;
  cursor: ActionLogCursor | null;
  action: string | null;
  /** Inclusive lower bound on createdAt. */
  from: Date | null;
  /** Exclusive upper bound on createdAt (a date-only `to` covers that whole UTC day). */
  toExclusive: Date | null;
  /**
   * The acting admin the query is restricted to: ALWAYS the caller for a non-superadmin (taken from the token, never
   * from the request); the requested `adminId` (or null = everyone) for a superadmin.
   */
  adminId: string | null;
}

export interface RawActionLogQuery {
  cursor?: string;
  limit?: string;
  action?: string;
  from?: string;
  to?: string;
  adminId?: string;
}

function bad(code: string, message: string): never {
  throw new BadRequestException({ statusCode: 400, error: 'Bad Request', code, message });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
// A full ISO-8601 instant with an explicit zone, so the bound never depends on the server's time zone.
const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

function parseBound(raw: string, which: 'from' | 'to'): { date: Date; dateOnly: boolean } {
  const text = raw.trim();
  const dateOnly = DATE_ONLY_RE.test(text);
  if (!dateOnly && !INSTANT_RE.test(text)) {
    bad(ADMIN_ACTION_LOG_DATE_INVALID_CODE, `\`${which}\` must be a date (YYYY-MM-DD) or an ISO-8601 time with a zone.`);
  }
  const date = new Date(dateOnly ? `${text}T00:00:00.000Z` : text);
  if (Number.isNaN(date.getTime())) {
    bad(ADMIN_ACTION_LOG_DATE_INVALID_CODE, `\`${which}\` is not a real date.`);
  }
  // A date-only value such as 2026-02-31 must not roll over silently into March.
  if (dateOnly && date.toISOString().slice(0, 10) !== text) {
    bad(ADMIN_ACTION_LOG_DATE_INVALID_CODE, `\`${which}\` is not a real date.`);
  }
  return { date, dateOnly };
}

export function encodeActionLogCursor(cursor: ActionLogCursor): string {
  return Buffer.from(JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id }), 'utf8').toString('base64url');
}

export function decodeActionLogCursor(raw: string): ActionLogCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return bad(ADMIN_ACTION_LOG_CURSOR_INVALID_CODE, 'Invalid pagination cursor.');
  }
  const p = parsed as { createdAt?: unknown; id?: unknown } | null;
  if (typeof p !== 'object' || p === null || typeof p.createdAt !== 'string' || typeof p.id !== 'string') {
    return bad(ADMIN_ACTION_LOG_CURSOR_INVALID_CODE, 'Invalid pagination cursor.');
  }
  const date = new Date(p.createdAt);
  if (Number.isNaN(date.getTime()) || p.id.length === 0) {
    return bad(ADMIN_ACTION_LOG_CURSOR_INVALID_CODE, 'Invalid pagination cursor.');
  }
  return { createdAt: date, id: p.id };
}

export function parseActionLogQuery(raw: RawActionLogQuery, caller: { sub: string; role: string }): ParsedActionLogQuery {
  let limit = ADMIN_ACTION_LOG_DEFAULT_PAGE_SIZE;
  if (raw.limit !== undefined) {
    if (!/^\d+$/.test(raw.limit.trim())) bad(ADMIN_ACTION_LOG_LIMIT_INVALID_CODE, '`limit` must be a whole number.');
    limit = Number(raw.limit.trim());
    if (limit < 1 || limit > ADMIN_ACTION_LOG_MAX_PAGE_SIZE) {
      bad(ADMIN_ACTION_LOG_LIMIT_INVALID_CODE, `\`limit\` must be between 1 and ${ADMIN_ACTION_LOG_MAX_PAGE_SIZE}.`);
    }
  }

  let action: string | null = null;
  if (raw.action !== undefined) {
    if (!ADMIN_ACTION_LOG_ACTION_VALUES.includes(raw.action)) {
      bad(ADMIN_ACTION_LOG_ACTION_INVALID_CODE, '`action` is not a known action.');
    }
    action = raw.action;
  }

  const fromParsed = raw.from !== undefined ? parseBound(raw.from, 'from') : null;
  const toParsed = raw.to !== undefined ? parseBound(raw.to, 'to') : null;
  const from = fromParsed ? fromParsed.date : null;
  let toExclusive: Date | null = null;
  if (toParsed) {
    // A date-only `to` means "through the end of that UTC day"; an instant `to` includes that millisecond.
    toExclusive = new Date(toParsed.date.getTime() + (toParsed.dateOnly ? 24 * 60 * 60 * 1000 : 1));
  }
  if (from && toExclusive && from.getTime() >= toExclusive.getTime()) {
    bad(ADMIN_ACTION_LOG_RANGE_INVALID_CODE, '`from` must be before `to`.');
  }

  // The scope. A superadmin may pick an acting admin; anyone else may not pass the parameter AT ALL (even their own
  // id): their scope is always themselves, from the token.
  let adminId: string | null;
  if (caller.role === ADMIN_ACTION_LOG_READ_ALL_ROLE) {
    if (raw.adminId !== undefined) {
      if (!UUID_RE.test(raw.adminId)) bad(ADMIN_ACTION_LOG_ADMIN_ID_INVALID_CODE, '`adminId` must be an admin id.');
      adminId = raw.adminId.toLowerCase();
    } else {
      adminId = null;
    }
  } else {
    if (raw.adminId !== undefined) {
      bad(ADMIN_ACTION_LOG_ADMIN_FILTER_NOT_ALLOWED_CODE, 'Only a superadmin can filter the action log by admin.');
    }
    adminId = caller.sub;
  }

  const cursor = raw.cursor !== undefined ? decodeActionLogCursor(raw.cursor) : null;
  return { limit, cursor, action, from, toExclusive, adminId };
}
