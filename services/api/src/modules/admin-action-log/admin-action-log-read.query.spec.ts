import { BadRequestException } from '@nestjs/common';
import { ADMIN_ACTION_LOG_ACTIONS } from './admin-action-log.constants';
import {
  ADMIN_ACTION_LOG_ACTION_INVALID_CODE,
  ADMIN_ACTION_LOG_ADMIN_FILTER_NOT_ALLOWED_CODE,
  ADMIN_ACTION_LOG_ADMIN_ID_INVALID_CODE,
  ADMIN_ACTION_LOG_CURSOR_INVALID_CODE,
  ADMIN_ACTION_LOG_DATE_INVALID_CODE,
  ADMIN_ACTION_LOG_DEFAULT_PAGE_SIZE,
  ADMIN_ACTION_LOG_LIMIT_INVALID_CODE,
  ADMIN_ACTION_LOG_MAX_PAGE_SIZE,
  ADMIN_ACTION_LOG_RANGE_INVALID_CODE,
} from './admin-action-log-read.constants';
import { encodeActionLogCursor, parseActionLogQuery } from './admin-action-log-read.query';

const SUPER = { sub: '11111111-1111-4111-8111-111111111111', role: 'superadmin' };
const EDITOR = { sub: '22222222-2222-4222-8222-222222222222', role: 'editor' };
const MODERATOR = { sub: '33333333-3333-4333-8333-333333333333', role: 'moderator' };
const OTHER_ADMIN = '44444444-4444-4444-8444-444444444444';

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(BadRequestException);
    return ((e as BadRequestException).getResponse() as { code?: string }).code;
  }
  return undefined;
}

describe('parseActionLogQuery', () => {
  it('uses the shared default page size (20) and maximum (50)', () => {
    expect(ADMIN_ACTION_LOG_DEFAULT_PAGE_SIZE).toBe(20);
    expect(ADMIN_ACTION_LOG_MAX_PAGE_SIZE).toBe(50);
    expect(parseActionLogQuery({}, SUPER).limit).toBe(20);
    expect(parseActionLogQuery({ limit: '50' }, SUPER).limit).toBe(50);
  });

  it.each(['0', '51', '-1', '2.5', 'abc', ''])('rejects limit %j with a stable code', (limit) => {
    expect(codeOf(() => parseActionLogQuery({ limit }, SUPER))).toBe(ADMIN_ACTION_LOG_LIMIT_INVALID_CODE);
  });

  describe('scope', () => {
    it('a superadmin with no adminId is unscoped (null = every admin)', () => {
      expect(parseActionLogQuery({}, SUPER).adminId).toBeNull();
    });

    it('a superadmin may filter by an acting admin (lower-cased)', () => {
      expect(parseActionLogQuery({ adminId: OTHER_ADMIN.toUpperCase() }, SUPER).adminId).toBe(OTHER_ADMIN);
    });

    it('a superadmin gets a stable code for an adminId that is not an id', () => {
      expect(codeOf(() => parseActionLogQuery({ adminId: 'nope' }, SUPER))).toBe(ADMIN_ACTION_LOG_ADMIN_ID_INVALID_CODE);
    });

    it.each([EDITOR, MODERATOR])('a $role is always scoped to themselves, from the token', (caller) => {
      expect(parseActionLogQuery({}, caller).adminId).toBe(caller.sub);
    });

    it.each([EDITOR, MODERATOR])('a $role passing adminId is REJECTED (another admin, or their own)', (caller) => {
      expect(codeOf(() => parseActionLogQuery({ adminId: OTHER_ADMIN }, caller))).toBe(ADMIN_ACTION_LOG_ADMIN_FILTER_NOT_ALLOWED_CODE);
      expect(codeOf(() => parseActionLogQuery({ adminId: caller.sub }, caller))).toBe(ADMIN_ACTION_LOG_ADMIN_FILTER_NOT_ALLOWED_CODE);
    });

    it('an unknown role is scoped to itself, never widened', () => {
      const caller = { sub: EDITOR.sub, role: 'something-new' };
      expect(parseActionLogQuery({}, caller).adminId).toBe(caller.sub);
      expect(codeOf(() => parseActionLogQuery({ adminId: OTHER_ADMIN }, caller))).toBe(ADMIN_ACTION_LOG_ADMIN_FILTER_NOT_ALLOWED_CODE);
    });
  });

  describe('action', () => {
    it('accepts every action the codebase can write', () => {
      for (const action of Object.values(ADMIN_ACTION_LOG_ACTIONS)) {
        expect(parseActionLogQuery({ action }, SUPER).action).toBe(action);
      }
    });

    it('rejects an unknown action with a stable code', () => {
      expect(codeOf(() => parseActionLogQuery({ action: 'report.deleted' }, SUPER))).toBe(ADMIN_ACTION_LOG_ACTION_INVALID_CODE);
      expect(codeOf(() => parseActionLogQuery({ action: '' }, SUPER))).toBe(ADMIN_ACTION_LOG_ACTION_INVALID_CODE);
    });
  });

  describe('from / to', () => {
    it('a date-only `from` is the start of that UTC day; a date-only `to` covers that whole UTC day', () => {
      const q = parseActionLogQuery({ from: '2026-11-01', to: '2026-11-02' }, SUPER);
      expect(q.from?.toISOString()).toBe('2026-11-01T00:00:00.000Z');
      expect(q.toExclusive?.toISOString()).toBe('2026-11-03T00:00:00.000Z');
    });

    it('an instant with a zone is used as given; `to` includes that millisecond', () => {
      const q = parseActionLogQuery({ from: '2026-11-01T10:00:00+01:00', to: '2026-11-02T10:00:00.500Z' }, SUPER);
      expect(q.from?.toISOString()).toBe('2026-11-01T09:00:00.000Z');
      expect(q.toExclusive?.toISOString()).toBe('2026-11-02T10:00:00.501Z');
    });

    it.each(['yesterday', '2026-13-01', '2026-02-31', '2026-11-01T10:00:00', '01/11/2026', ''])('rejects %j', (from) => {
      expect(codeOf(() => parseActionLogQuery({ from }, SUPER))).toBe(ADMIN_ACTION_LOG_DATE_INVALID_CODE);
      expect(codeOf(() => parseActionLogQuery({ to: from }, SUPER))).toBe(ADMIN_ACTION_LOG_DATE_INVALID_CODE);
    });

    it('rejects an empty or reversed range', () => {
      expect(codeOf(() => parseActionLogQuery({ from: '2026-11-03', to: '2026-11-02' }, SUPER))).toBe(ADMIN_ACTION_LOG_RANGE_INVALID_CODE);
      expect(codeOf(() => parseActionLogQuery({ from: '2026-11-02T00:00:00Z', to: '2026-11-01T23:59:59Z' }, SUPER))).toBe(
        ADMIN_ACTION_LOG_RANGE_INVALID_CODE,
      );
    });

    it('accepts a one-day range', () => {
      expect(() => parseActionLogQuery({ from: '2026-11-02', to: '2026-11-02' }, SUPER)).not.toThrow();
    });
  });

  describe('cursor', () => {
    it('round-trips', () => {
      const createdAt = new Date('2026-11-02T10:11:12.345Z');
      const q = parseActionLogQuery({ cursor: encodeActionLogCursor({ createdAt, id: 'row-1' }) }, SUPER);
      expect(q.cursor).toEqual({ createdAt, id: 'row-1' });
    });

    it.each(['!!!', Buffer.from('not json').toString('base64url'), Buffer.from('{"createdAt":"x","id":"y"}').toString('base64url'), Buffer.from('{"id":"y"}').toString('base64url')])(
      'rejects the malformed cursor %j with a stable code',
      (cursor) => {
        expect(codeOf(() => parseActionLogQuery({ cursor }, SUPER))).toBe(ADMIN_ACTION_LOG_CURSOR_INVALID_CODE);
      },
    );
  });
});
