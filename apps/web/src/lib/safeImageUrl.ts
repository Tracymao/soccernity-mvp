// R106: the web app contacts NO third-party image host (Decision Log #547).
// An image URL that arrives in an API response (a team crest, a club badge, a
// video thumbnail) is drawn only when it points at this app's own origin, is a
// data: or blob: URL (the CSP allows both), or lives on the configured public
// media host (VITE_MEDIA_BASE_URL, the same host the CSP img-src allows).
// Anything else returns null so the caller shows its fallback (initials or
// monogram) and the browser never makes the request.

function mediaOrigin(): string | null {
  const raw = (import.meta.env.VITE_MEDIA_BASE_URL as string | undefined)?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

export function safeImageUrl(src: string | null | undefined): string | null {
  if (!src) return null;
  const value = src.trim();
  if (!value) return null;
  // Protocol-relative URLs inherit the page protocol but name any host.
  if (value.startsWith("//") || value.startsWith("\\")) return null;
  const lower = value.toLowerCase();
  if (lower.startsWith("data:image/") || lower.startsWith("blob:")) return value;
  let url: URL;
  try {
    url = new URL(value, window.location.origin);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.origin === window.location.origin) return value;
  const media = mediaOrigin();
  if (media && url.origin === media) return value;
  return null;
}
