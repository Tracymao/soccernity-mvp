// Decision Log #348 -- counsel asked for "a minimal technical identifier
// such as device type". Deliberately a three-value category derived at the
// moment of confirmation; the raw User-Agent is never stored, logged by
// this code, or returned (data minimisation, docs/sprint-1-dpia-outline-draft.md).
// Best-effort heuristic, not fingerprinting: tablets count as "mobile"
// only when the UA says so; anything unrecognised is "unknown".
export type ConsentDeviceType = 'mobile' | 'desktop' | 'unknown';

export function classifyDeviceType(userAgent: string | undefined | null): ConsentDeviceType {
  if (!userAgent || !userAgent.trim()) return 'unknown';
  if (/Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(userAgent)) return 'mobile';
  if (/Windows NT|Macintosh|X11|Linux|CrOS/i.test(userAgent)) return 'desktop';
  return 'unknown';
}
