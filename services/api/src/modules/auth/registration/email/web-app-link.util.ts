// B-016. Builds an absolute link into apps/web for use inside an email.
//
// Returns null -- never a guess -- when the base URL cannot be trusted, so the
// caller can refuse to send an email whose only call to action is a dead or
// unsafe link. "Cannot be trusted" means: unset/blank, not a parseable http(s)
// URL, a reserved placeholder host (anything ending `.example`, the
// `replace-me` placeholders), or plain http outside localhost (a one-time
// credential must not travel in a downgradeable link).
//
// password-reset-email.service.ts predates this and falls back to the
// placeholder host 'https://app.soccernity.example'; it is intentionally left
// as it was (not part of B-016) and is listed as a follow-up in the report.
export function buildWebAppLink(
  baseUrl: string | undefined | null,
  path: string,
  query: Record<string, string>,
): string | null {
  const raw = baseUrl?.trim();
  if (!raw) return null;

  let base: URL;
  try {
    base = new URL(raw);
  } catch {
    return null;
  }

  const host = base.hostname.toLowerCase();
  if (host.endsWith('.example') || host === 'example' || host.includes('replace-me')) return null;

  if (base.protocol !== 'http:' && base.protocol !== 'https:') return null;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  if (base.protocol === 'http:' && !isLocal) return null;

  // Keep any path prefix the base carries ("https://x.com/app"), drop a
  // trailing slash, and ignore any query/fragment on the base itself.
  const prefix = base.pathname.replace(/\/+$/, '');
  const link = new URL(`${base.origin}${prefix}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [k, v] of Object.entries(query)) link.searchParams.set(k, v);
  return link.toString();
}
