import { BadRequestException } from '@nestjs/common';
import {
  decodeUserNameCursor,
  encodeUserNameCursor,
  USER_NAME_ORDER_BY,
  userNameAfterCursor,
  userNameCursorOf,
} from './user-name-keyset.util';

describe('user-name keyset (B-034)', () => {
  it('orders by username ascending with no-username accounts last, then id; never by displayName', () => {
    expect(USER_NAME_ORDER_BY).toEqual([{ username: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }]);
    expect(JSON.stringify(USER_NAME_ORDER_BY)).not.toContain('displayName');
  });

  it('round-trips a named and a null username', () => {
    expect(decodeUserNameCursor(encodeUserNameCursor({ username: 'ada_9', id: 'u-1' }))).toEqual({ username: 'ada_9', id: 'u-1' });
    expect(decodeUserNameCursor(encodeUserNameCursor({ username: null, id: 'u-2' }))).toEqual({ username: null, id: 'u-2' });
  });

  it('builds the cursor from the row public fields only', () => {
    const row = { id: 'u-1', username: 'ada_9', displayName: 'Ada Real Name' };
    const raw = Buffer.from(userNameCursorOf(row), 'base64url').toString('utf8');
    expect(raw).not.toContain('Ada');
    expect(JSON.parse(raw)).toEqual({ username: 'ada_9', id: 'u-1' });
  });

  it.each([
    ['legacy club-style cursor', { name: 'Ada', id: 'u-1' }],
    ['legacy search cursor', { displayName: 'Ada', id: 'u-1' }],
    ['missing id', { username: 'ada_9' }],
    ['missing username key', { id: 'u-1' }],
    ['numeric username', { username: 5, id: 'u-1' }],
    ['numeric id', { username: 'a', id: 1 }],
    ['an array', [1, 2]],
  ])('rejects %s with a 400', (_label, payload) => {
    const raw = Buffer.from(JSON.stringify(payload)).toString('base64url');
    expect(() => decodeUserNameCursor(raw)).toThrow(BadRequestException);
  });

  it('rejects garbage and non-JSON', () => {
    expect(() => decodeUserNameCursor('%%%')).toThrow(BadRequestException);
    expect(() => decodeUserNameCursor(Buffer.from('not json').toString('base64url'))).toThrow(BadRequestException);
    expect(() => decodeUserNameCursor(Buffer.from('null').toString('base64url'))).toThrow(BadRequestException);
  });

  it('after a named user: later usernames, a same-name later id, and the whole no-username group', () => {
    expect(userNameAfterCursor({ username: 'ada_9', id: 'u-1' })).toEqual({
      OR: [{ username: { gt: 'ada_9' } }, { username: 'ada_9', id: { gt: 'u-1' } }, { username: null }],
    });
  });

  it('after a no-username user: only later ids within the no-username group', () => {
    expect(userNameAfterCursor({ username: null, id: 'u-1' })).toEqual({ username: null, id: { gt: 'u-1' } });
  });
});
