import { PUBLIC_NAME_SELECT, publicNameContains, resolvePublicName, toPublicUser } from './public-name.util';

describe('resolvePublicName (username first, displayName fallback)', () => {
  it('returns the username when one is set', () => {
    expect(resolvePublicName({ username: 'goalie_9', displayName: 'Ada Obi' })).toBe('goalie_9');
  });

  it('falls back to displayName when username is null', () => {
    expect(resolvePublicName({ username: null, displayName: 'Ada Obi' })).toBe('Ada Obi');
  });

  it('falls back to displayName when username is undefined or an empty string', () => {
    expect(resolvePublicName({ displayName: 'Ada Obi' })).toBe('Ada Obi');
    expect(resolvePublicName({ username: '', displayName: 'Ada Obi' })).toBe('Ada Obi');
  });
});

describe('toPublicUser', () => {
  it('returns only { id, publicName } -- the raw displayName is never forwarded when a username exists', () => {
    const result = toPublicUser({ id: 'u1', username: 'goalie_9', displayName: 'Ada Obi' });
    expect(result).toEqual({ id: 'u1', publicName: 'goalie_9' });
    expect(Object.keys(result).sort()).toEqual(['id', 'publicName']);
    expect(JSON.stringify(result)).not.toContain('Ada Obi');
  });

  it('uses the displayName as publicName when there is no username', () => {
    expect(toPublicUser({ id: 'u2', username: null, displayName: 'Ben Cole' })).toEqual({
      id: 'u2',
      publicName: 'Ben Cole',
    });
  });
});

describe('publicNameContains', () => {
  it('matches username, or displayName only when no username is set', () => {
    expect(publicNameContains('ada')).toEqual({
      OR: [
        { username: { contains: 'ada', mode: 'insensitive' } },
        { AND: [{ username: null }, { displayName: { contains: 'ada', mode: 'insensitive' } }] },
      ],
    });
  });
});

describe('PUBLIC_NAME_SELECT', () => {
  it('selects exactly the two columns the resolver needs', () => {
    expect(PUBLIC_NAME_SELECT).toEqual({ username: true, displayName: true });
  });
});
