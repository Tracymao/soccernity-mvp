import {
  DELETED_USER_PUBLIC_NAME,
  INCOMPLETE_PROFILE_PUBLIC_NAME,
  PUBLIC_NAME_SELECT,
  publicNameContains,
  resolvePublicName,
  toPublicUser,
} from './public-name.util';

// B-027 (Decision Log #369, #403 item 15): username, else the neutral
// placeholder. The #364 "display name as fallback" is gone -- no account is
// shown to other users under a real name.
describe('resolvePublicName (username, else the placeholder)', () => {
  it("the placeholder is exactly 'Soccernity member' (founder-decided, #403 item 15)", () => {
    expect(INCOMPLETE_PROFILE_PUBLIC_NAME).toBe('Soccernity member');
  });

  it('returns the username when one is set', () => {
    expect(resolvePublicName({ username: 'goalie_9', displayName: 'Ada Obi' })).toBe('goalie_9');
  });

  it('returns the placeholder when username is null, never the real name', () => {
    expect(resolvePublicName({ username: null, displayName: 'Ada Obi' })).toBe('Soccernity member');
  });

  it("an anonymized account (Decision Log #341) is '[deleted user]', NOT the incomplete-profile placeholder", () => {
    expect(resolvePublicName({ username: null, displayName: '[deleted user]' })).toBe('[deleted user]');
    expect(DELETED_USER_PUBLIC_NAME).toBe('[deleted user]');
    expect(toPublicUser({ id: 'u9', username: null, displayName: '[deleted user]' })).toEqual({
      id: 'u9',
      publicName: '[deleted user]',
    });
  });

  it('only that exact sentinel is honoured: a near-miss real name still gets the placeholder', () => {
    expect(resolvePublicName({ username: null, displayName: '[Deleted User]' })).toBe('Soccernity member');
    expect(resolvePublicName({ username: null, displayName: 'Deleted user' })).toBe('Soccernity member');
  });

  it('returns the placeholder when username is undefined or an empty string', () => {
    expect(resolvePublicName({ displayName: 'Ada Obi' })).toBe('Soccernity member');
    expect(resolvePublicName({ username: '', displayName: 'Ada Obi' })).toBe('Soccernity member');
    expect(resolvePublicName({})).toBe('Soccernity member');
  });
});

describe('toPublicUser', () => {
  it('returns only { id, publicName } -- the raw displayName is never forwarded when a username exists', () => {
    const result = toPublicUser({ id: 'u1', username: 'goalie_9', displayName: 'Ada Obi' });
    expect(result).toEqual({ id: 'u1', publicName: 'goalie_9' });
    expect(Object.keys(result).sort()).toEqual(['id', 'publicName']);
    expect(JSON.stringify(result)).not.toContain('Ada Obi');
  });

  it('shows the placeholder, and not the real name, when there is no username', () => {
    const result = toPublicUser({ id: 'u2', username: null, displayName: 'Ben Cole' });
    expect(result).toEqual({ id: 'u2', publicName: 'Soccernity member' });
    expect(JSON.stringify(result)).not.toContain('Ben Cole');
  });
});

describe('publicNameContains', () => {
  it('matches the username only -- not the real displayName, and not accounts that have no username', () => {
    expect(publicNameContains('ada')).toEqual({
      OR: [{ username: { contains: 'ada', mode: 'insensitive' } }],
    });
  });
});

describe('PUBLIC_NAME_SELECT', () => {
  it('still selects username + displayName (displayName is only kept for cursors/ordering until B-034)', () => {
    expect(PUBLIC_NAME_SELECT).toEqual({ username: true, displayName: true });
  });
});
