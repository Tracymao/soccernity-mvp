import { PRIVATE_PREFIX, PUBLIC_PREFIX } from '../post-media/post-media-objects.service';
import {
  PRIVATE_PROFILE_PREFIX,
  PUBLIC_PROFILE_PREFIX,
  isPublicProfileKey,
  privateProfileKey,
  publicProfileKeyFor,
} from './profile-image.util';

// backend/b036-avatar-cover-check: where a profile picture lives. The prefixes are a safeguarding rule (a pending
// picture must not be under a prefix the public address serves), so they are pinned here.
describe('profile picture storage keys (B-036)', () => {
  it('a new upload is keyed under the PRIVATE prefix, per user', () => {
    expect(privateProfileKey('u1', 'abc', 'jpg')).toBe('private-profile/u1/abc.jpg');
    expect(PRIVATE_PROFILE_PREFIX).toBe('private-profile');
  });

  it('the public key is the same user and file under the PUBLIC prefix', () => {
    expect(publicProfileKeyFor('private-profile/u1/abc.jpg')).toBe('profile-media/u1/abc.jpg');
    expect(PUBLIC_PROFILE_PREFIX).toBe('profile-media');
  });

  it('a key from before this design (avatars/ or covers/) maps to the same public key shape', () => {
    expect(publicProfileKeyFor('avatars/u1/old.png')).toBe('profile-media/u1/old.png');
    expect(publicProfileKeyFor('covers/u2/old.webp')).toBe('profile-media/u2/old.webp');
  });

  it('only a key in the public prefix counts as published', () => {
    expect(isPublicProfileKey('profile-media/u1/a.jpg')).toBe(true);
    for (const key of ['private-profile/u1/a.jpg', 'avatars/u1/a.jpg', 'post-media/u1/a.jpg', 'profile-media-x/u1/a.jpg']) {
      expect(isPublicProfileKey(key)).toBe(false);
    }
  });

  // The post-media stray sweep lists post-media/, private-media/ and quarantine/ and deletes any object with no
  // PostMedia row. A profile prefix inside one of those would have its pictures deleted.
  it('neither profile prefix is, or sits inside, a prefix the post-media stray sweep lists', () => {
    for (const profilePrefix of [PRIVATE_PROFILE_PREFIX, PUBLIC_PROFILE_PREFIX]) {
      for (const swept of [PRIVATE_PREFIX, PUBLIC_PREFIX, 'quarantine']) {
        expect(`${profilePrefix}/`.startsWith(`${swept}/`)).toBe(false);
      }
    }
  });
});
