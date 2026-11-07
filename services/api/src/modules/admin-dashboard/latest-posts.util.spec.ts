import { toExcerpt, toMediaType } from './latest-posts.util';

describe('toExcerpt', () => {
  it('returns short text unchanged (trimmed)', () => {
    expect(toExcerpt('  hello  ')).toBe('hello');
  });
  it('cuts at exactly 140 characters, no ellipsis', () => {
    expect(toExcerpt('a'.repeat(300))).toHaveLength(140);
    expect(toExcerpt('a'.repeat(140))).toHaveLength(140);
    expect(toExcerpt('a'.repeat(141))).toHaveLength(140);
    expect(toExcerpt('a'.repeat(139))).toHaveLength(139);
  });
  it('never splits an emoji (counts code points)', () => {
    const out = toExcerpt('\u{1F600}'.repeat(200));
    expect(Array.from(out)).toHaveLength(140);
    expect(out).toBe('\u{1F600}'.repeat(140));
  });
  it('handles empty text', () => {
    expect(toExcerpt('')).toBe('');
  });
});

describe('toMediaType', () => {
  it('is null with no media at all', () => {
    expect(toMediaType([], [])).toBeNull();
  });
  it('is photo for images only, video when any video is attached', () => {
    expect(toMediaType(['image', 'image'], [])).toBe('photo');
    expect(toMediaType(['video'], [])).toBe('video');
    expect(toMediaType(['image', 'video'], [])).toBe('video');
  });
  it('prefers uploaded media over legacy urls', () => {
    expect(toMediaType(['image'], ['https://x/y.mp4'])).toBe('photo');
  });
  it('classifies a legacy url by extension (query string ignored)', () => {
    expect(toMediaType([], ['https://x/a.jpg'])).toBe('photo');
    expect(toMediaType([], ['https://x/a.MP4?sig=1'])).toBe('video');
  });
});
