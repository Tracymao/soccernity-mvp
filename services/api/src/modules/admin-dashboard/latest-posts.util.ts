import { DASHBOARD_LATEST_POSTS_EXCERPT_LENGTH } from './admin-dashboard.constants';

export type DashboardMediaType = 'photo' | 'video' | null;

// First 140 characters of the post text, by code point (never splits a surrogate pair), trimmed.
export function toExcerpt(text: string): string {
  return Array.from(text.trim()).slice(0, DASHBOARD_LATEST_POSTS_EXCERPT_LENGTH).join('').trimEnd();
}

const VIDEO_EXTENSION = /\.(mp4|webm|mov|m4v|ogv)(?:[?#].*)?$/i;

// Photo, video or none. Uploaded media (PostMedia, kind 'image' | 'video') is the source of truth; a post
// that mixes both is a 'video'. DEFAULT, founder-veto-able: a post with only a legacy bare `mediaUrls`
// entry (created before the upload pipeline, no PostMedia row) is classified by file extension.
export function toMediaType(kinds: readonly string[], legacyMediaUrls: readonly string[]): DashboardMediaType {
  if (kinds.length > 0) return kinds.includes('video') ? 'video' : 'photo';
  if (legacyMediaUrls.length > 0) return legacyMediaUrls.some((u) => VIDEO_EXTENSION.test(u)) ? 'video' : 'photo';
  return null;
}
