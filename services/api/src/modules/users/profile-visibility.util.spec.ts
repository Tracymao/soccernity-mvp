import { effectiveProfilePublic, postProfileVisibleTo, profileVisibleTo } from './profile-visibility.util';

// B-060 (Public profile toggle): the one rule, pinned structurally here and proven against real Postgres in
// test/profile-visibility.e2e-spec.ts.
describe('profileVisibleTo', () => {
  it('for a signed-in viewer: public, under-18, the viewer themself, or a follower of the owner', () => {
    expect(profileVisibleTo('v1')).toEqual({
      OR: [
        { isProfilePublic: true },
        { isMinor: true },
        { id: 'v1' },
        { followedBy: { some: { followerId: 'v1' } } },
      ],
    });
  });

  it('for an anonymous reader: only a public or under-18 profile', () => {
    expect(profileVisibleTo(undefined)).toEqual({ OR: [{ isProfilePublic: true }, { isMinor: true }] });
  });
});

describe('postProfileVisibleTo', () => {
  it("shows a post when its author's profile is visible, or it is a Banter Room post, or a Contest entry", () => {
    expect(postProfileVisibleTo('v1')).toEqual({
      OR: [
        { banterRoomId: { not: null } },
        { contestEntry: { isNot: null } },
        { author: { is: profileVisibleTo('v1') } },
      ],
    });
  });

  it('an anonymous reader gets the anonymous author rule inside the same exemptions', () => {
    expect(postProfileVisibleTo(undefined)).toEqual({
      OR: [
        { banterRoomId: { not: null } },
        { contestEntry: { isNot: null } },
        { author: { is: profileVisibleTo(undefined) } },
      ],
    });
  });
});

describe('effectiveProfilePublic', () => {
  it.each([
    [true, false, true],
    [false, false, false],
    // an under-18 account is always effectively public, whatever the column holds
    [false, true, true],
    [true, true, true],
    // a missing value reads as the default (public): only an explicit false makes a profile private
    [undefined, false, true],
    [null, false, true],
  ])('stored %s, isMinor %s -> %s', (stored, isMinor, expected) => {
    expect(effectiveProfilePublic(stored as boolean | null | undefined, isMinor)).toBe(expected);
  });
});
