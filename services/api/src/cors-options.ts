// QA D-01 / Decision Log #407 item 1. The API used `app.enableCors()` with no
// options, which answers `Access-Control-Allow-Origin: *`. Browsers refuse a
// wildcard on a credentialed request, so sign-up (the one call that sent
// `credentials: "include"`) failed in every browser when apps/web and the API
// sit on different origins, as they do on Render. The credentials mode had no
// function (the API sets no cookie and returns the refresh token in the body),
// so the web client stops sending it; the API ALSO stops answering `*`.
//
// Allowed origins, and nothing else:
//   - the origin of WEB_APP_BASE_URL   (apps/web)
//   - the origin of ADMIN_APP_BASE_URL (apps/admin)
//   - outside production only: http(s) localhost / 127.0.0.1 / [::1], any port
//
// A request with no Origin header (curl, server-to-server, same-origin) is not
// a CORS request and is untouched. A disallowed browser origin gets no
// Access-Control-Allow-Origin header, so the browser blocks the response.
//
// Fail-closed: a variable that is unset, unparseable, a placeholder host, or
// (in production) not https contributes NO origin. In production the process
// never gets this far with such a value: assertProductionEnv
// (validate-runtime-env.ts, B-163, Decision Log #408 item 1) refuses to boot
// first. The `problems` log below therefore only matters outside production,
// and as a second line if the boot check is ever bypassed.

export interface CorsEnv {
  NODE_ENV?: string;
  WEB_APP_BASE_URL?: string;
  ADMIN_APP_BASE_URL?: string;
}

export interface CorsConfig {
  // Exact origins (scheme + host + port, no path, no trailing slash).
  allowedOrigins: string[];
  allowLocalhost: boolean;
  // One human-readable line per variable that was set but could not be used,
  // or was unset in production. Never contains a secret.
  problems: string[];
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function isPlaceholderHost(host: string): boolean {
  return host.endsWith('.example') || host === 'example' || host.includes('replace-me');
}

// The origin of a configured base URL, or null when it cannot be trusted.
export function originFromBaseUrl(raw: string | undefined | null, production: boolean): string | null {
  const v = raw?.trim();
  if (!v) return null;
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  if (isPlaceholderHost(host)) return null;
  if (production) {
    // Production origins must be https and must not be localhost.
    if (url.protocol !== 'https:' || LOCAL_HOSTS.has(host)) return null;
  }
  return url.origin;
}

export function buildCorsConfig(env: CorsEnv): CorsConfig {
  const production = env.NODE_ENV === 'production';
  const allowedOrigins: string[] = [];
  const problems: string[] = [];

  for (const name of ['WEB_APP_BASE_URL', 'ADMIN_APP_BASE_URL'] as const) {
    const origin = originFromBaseUrl(env[name], production);
    if (origin) {
      if (!allowedOrigins.includes(origin)) allowedOrigins.push(origin);
    } else if (env[name]?.trim()) {
      problems.push(
        `${name} is set but unusable for CORS (not a valid URL, a placeholder, or${
          production ? ' not https /' : ''
        } localhost in production) -- no origin allowed for it.`,
      );
    } else if (production) {
      problems.push(`${name} is not set -- no origin allowed for it, so that app cannot call this API from a browser.`);
    }
  }

  return { allowedOrigins, allowLocalhost: !production, problems };
}

function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:') && LOCAL_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function isOriginAllowed(origin: string | undefined, config: CorsConfig): boolean {
  // Not a CORS request: nothing to decide, nothing to add.
  if (!origin) return true;
  if (config.allowedOrigins.includes(origin)) return true;
  return config.allowLocalhost && isLocalOrigin(origin);
}

type OriginCallback = (err: Error | null, allow?: boolean) => void;

// The options object handed to `app.enableCors()`. `credentials` is left unset
// on purpose: nothing here uses cookies. `Retry-After` is exposed so a browser client can read it
// off a global-rate-limit 429 (a cross-origin response hides every non-safelisted header otherwise).
export function buildCorsOptions(config: CorsConfig) {
  return {
    exposedHeaders: ['Retry-After'],
    origin: (origin: string | undefined, callback: OriginCallback) => {
      callback(null, isOriginAllowed(origin, config));
    },
  };
}
