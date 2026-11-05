import { fileNameOf, formatProfileItemId, isProfileItemId, parseProfileItemId } from './profile-image-item-id';
import {
  decodeMediaReviewCursor,
  decodeMediaReviewPosition,
  encodeMediaReviewCursor,
  encodeMediaReviewPosition,
} from './media-review.cursor';

const USER = '9c776b8d-c69f-4862-b8cc-ae7c660cf951';
const FILE = '437ebb39-071c-4d1d-a235-7e7e9f462b77.jpg';

describe('profile item id (B-037)', () => {
  it('names the kind, the person and the stored FILE, from a private, legacy or public key alike', () => {
    for (const key of [`private-profile/${USER}/${FILE}`, `avatars/${USER}/${FILE}`, `profile-media/${USER}/${FILE}`]) {
      expect(formatProfileItemId('avatar', USER, key)).toBe(`avatar:${USER}:${FILE}`);
    }
    expect(formatProfileItemId('cover', USER, `private-profile/${USER}/${FILE}`)).toBe(`cover:${USER}:${FILE}`);
    expect(fileNameOf(`private-profile/${USER}/${FILE}`)).toBe(FILE);
  });

  it('round-trips through parse, and never confuses a post-media UUID with a profile id', () => {
    const id = formatProfileItemId('cover', USER, `private-profile/${USER}/${FILE}`);
    expect(parseProfileItemId(id)).toEqual({ kind: 'cover', userId: USER, file: FILE });
    expect(isProfileItemId(id)).toBe(true);
    expect(isProfileItemId('3b241101-e2bb-4255-8caf-4136c566a962')).toBe(false);
  });

  it.each([
    'avatar',
    `avatar:${USER}`,
    `avatar:${USER}:`,
    `banner:${USER}:${FILE}`,
    `avatar::${FILE}`,
    `avatar:${USER}:../${FILE}`,
    `avatar:${USER}:a/b.jpg`,
    `avatar:${USER}:${FILE}:extra`,
    `avatar:${'x'.repeat(65)}:${FILE}`,
  ])('rejects the malformed id %s', (id) => {
    expect(parseProfileItemId(id)).toBeNull();
  });
});

describe('media review cursor (B-037)', () => {
  it('a post-media-only position is byte-identical to the shape that existed before B-037', () => {
    expect(encodeMediaReviewCursor(8)).toBe(Buffer.from('{"sequence":8}', 'utf8').toString('base64url'));
    expect(decodeMediaReviewCursor(encodeMediaReviewCursor(8))).toBe(8);
    expect(decodeMediaReviewPosition(Buffer.from('{"sequence":8}', 'utf8').toString('base64url'))).toEqual({ sequence: 8 });
  });

  it('carries a position in each stream', () => {
    const position = { sequence: 5, profile: { at: 1762336800000, id: `avatar:${USER}` } };
    expect(decodeMediaReviewPosition(encodeMediaReviewPosition(position))).toEqual(position);
    expect(decodeMediaReviewPosition(encodeMediaReviewPosition({ profile: position.profile }))).toEqual({ profile: position.profile });
  });

  it.each([
    'not-a-cursor',
    Buffer.from('{}', 'utf8').toString('base64url'),
    Buffer.from('{"sequence":0}', 'utf8').toString('base64url'),
    Buffer.from('{"sequence":1.5}', 'utf8').toString('base64url'),
    Buffer.from('{"profile":{"at":-1,"id":"avatar:u"}}', 'utf8').toString('base64url'),
    Buffer.from('{"profile":{"at":1,"id":"banner:u"}}', 'utf8').toString('base64url'),
    Buffer.from('{"profile":{"at":1}}', 'utf8').toString('base64url'),
  ])('rejects %s with a 400', (raw) => {
    expect(() => decodeMediaReviewPosition(raw)).toThrow('Invalid pagination cursor');
  });

  it('the post-media-only decoder refuses a cursor with no post position', () => {
    expect(() => decodeMediaReviewCursor(encodeMediaReviewPosition({ profile: { at: 0, id: `cover:${USER}` } }))).toThrow(
      'Invalid pagination cursor',
    );
  });
});
