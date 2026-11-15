import { DATA_EXPORT_STORAGE_PREFIX } from '../modules/data-export/data-export.constants';
import { PRIVATE_PREFIX as POST_MEDIA_PRIVATE_PREFIX, PUBLIC_PREFIX as POST_MEDIA_PUBLIC_PREFIX } from '../modules/post-media/post-media-objects.service';
import { QUARANTINE_PREFIX } from '../modules/post-media/post-media.service';
import { PRIVATE_PROFILE_PREFIX, PUBLIC_PROFILE_PREFIX } from '../modules/users/profile-image.util';
import { isPublicKey, isPublicPrefix, PUBLIC_KEY_PREFIXES } from './storage-prefixes';

// B-265: the public allow-list is the ONLY thing that decides which bucket a key lives in. Everything not on it is private
// by default, so a new prefix added later can never be served publicly by accident. These tests import the callers' own
// prefix constants, so renaming one of them without the allow-list fails here.
describe('storage-prefixes (B-265)', () => {
  it('the allow-list is exactly post-media, profile-media and media', () => {
    expect([...PUBLIC_KEY_PREFIXES].sort()).toEqual(['media', 'post-media', 'profile-media']);
  });

  describe('every prefix the code writes to', () => {
    const table: Array<[string, string, boolean]> = [
      ['post-media public prefix', `${POST_MEDIA_PUBLIC_PREFIX}/u1/abc.jpg`, true],
      ['profile-media public prefix', `${PUBLIC_PROFILE_PREFIX}/u1/abc.jpg`, true],
      // media.service.spec.ts pins the real key builder to the media/ prefix.
      ['admin media key', 'media/admin-1/3f2a-photo.jpg', true],
      ['post-media private prefix', `${POST_MEDIA_PRIVATE_PREFIX}/u1/abc.jpg`, false],
      ['profile private prefix', `${PRIVATE_PROFILE_PREFIX}/u1/abc.jpg`, false],
      ['quarantine', `${QUARANTINE_PREFIX}/u1/abc`, false],
      ['data export', `${DATA_EXPORT_STORAGE_PREFIX}u1/abc.json`, false],
      ['legacy avatars', 'avatars/u1/abc', false],
      ['legacy covers', 'covers/u1/abc', false],
      ['a future prefix nobody has classified', 'something-new/u1/abc', false],
      ['an empty key', '', false],
    ];
    it.each(table)('%s -> %s is %s', (_name, key, expected) => {
      expect(isPublicKey(key)).toBe(expected);
    });
  });

  it('matches on a whole path segment, not a string prefix (private-media/ is not media/, mediafoo/ is not media/)', () => {
    expect(isPublicKey('private-media/u/x')).toBe(false);
    expect(isPublicKey('mediafoo/u/x')).toBe(false);
    expect(isPublicKey('post-media-old/u/x')).toBe(false);
    expect(isPublicKey('media')).toBe(false);
    expect(isPublicKey('media/')).toBe(true);
  });

  describe('isPublicPrefix (used to route a listing)', () => {
    it.each([
      ['post-media/', true],
      ['post-media/u1/', true],
      ['profile-media/', true],
      ['media/', true],
      ['media', true],
      ['private-media/', false],
      ['private-profile/', false],
      ['quarantine/', false],
      ['data-export/', false],
      ['', false],
      ['m', false],
    ])('%j -> %s', (prefix, expected) => {
      expect(isPublicPrefix(prefix)).toBe(expected);
    });
  });
});
