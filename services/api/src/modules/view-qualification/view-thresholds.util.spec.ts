import { baselineRequiredSeconds, classifyPostMedia, contestRequiredSeconds } from './view-thresholds.util';

describe('classifyPostMedia', () => {
  it('video by extension (query and fragment ignored), photo for other media, text for none', () => {
    expect(classifyPostMedia([])).toBe('text');
    expect(classifyPostMedia(['https://x.test/a.jpg'])).toBe('photo');
    expect(classifyPostMedia(['https://x.test/a.MP4?sig=1#t=2'])).toBe('video');
    expect(classifyPostMedia(['https://x.test/a.jpg', 'https://x.test/b.webm'])).toBe('video');
    expect(classifyPostMedia(['/relative/clip.mov'])).toBe('video');
    expect(classifyPostMedia(['https://x.test/no-extension'])).toBe('photo');
  });
});

describe('baseline view thresholds (spec 9c)', () => {
  it('photo and text-only: 3 seconds', () => {
    expect(baselineRequiredSeconds('photo', undefined)).toBe(3);
    expect(baselineRequiredSeconds('text', undefined)).toBe(3);
    expect(baselineRequiredSeconds('photo', 500)).toBe(3); // a claimed length is irrelevant to a photo
  });

  it('video shorter than 60 seconds: the full length', () => {
    expect(baselineRequiredSeconds('video', 12)).toBe(12);
    expect(baselineRequiredSeconds('video', 59.5)).toBe(59.5);
  });

  it('video of 60 seconds or more: 60 seconds', () => {
    expect(baselineRequiredSeconds('video', 60)).toBe(60);
    expect(baselineRequiredSeconds('video', 600)).toBe(60);
  });

  it('a video with no claimed length is treated as long (60 seconds), never as instant', () => {
    expect(baselineRequiredSeconds('video', undefined)).toBe(60);
  });

  it('a tiny claimed length never qualifies in under one second', () => {
    expect(baselineRequiredSeconds('video', 0.5)).toBe(1);
  });
});

describe('contest view thresholds (spec 9c)', () => {
  it('photo: 5 seconds, whatever the weekly limit', () => {
    expect(contestRequiredSeconds('photo', undefined, 30)).toBe(5);
    expect(contestRequiredSeconds('photo', undefined, 3)).toBe(5);
  });

  it('text-only: the photo rule (5 seconds) - the spec states nothing, this is the adopted default', () => {
    expect(contestRequiredSeconds('text', undefined, 30)).toBe(5);
  });

  it('video: min(video length, the weekly limit L)', () => {
    expect(contestRequiredSeconds('video', 20, 30)).toBe(20); // shorter than L: watch it all
    expect(contestRequiredSeconds('video', 90, 30)).toBe(30); // longer than L: L seconds
    expect(contestRequiredSeconds('video', 30, 30)).toBe(30);
  });

  it('a video with no claimed length needs L', () => {
    expect(contestRequiredSeconds('video', undefined, 45)).toBe(45);
  });
});
