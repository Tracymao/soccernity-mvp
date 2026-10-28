import helmet from 'helmet';
import type { HelmetOptions } from 'helmet';

// Decision Log "API security headers" (#420), build register B-243.
//
// This API returns JSON only. It serves no HTML and no media bytes, so the
// policy is the strictest one that still lets a browser read a JSON response:
//   - Content-Security-Policy: default-src 'none'; frame-ancestors 'none'
//     (nothing the API returns may load a sub-resource or be framed)
//   - Strict-Transport-Security: production only. Sent over plain http in
//     development it would be ignored by browsers, and a stray HSTS on a
//     localhost dev port is a nuisance, so it is off outside production.
//   - Referrer-Policy: no-referrer
//   - X-Powered-By removed (helmet's default)
//   - helmet's other defaults stay on (X-Content-Type-Options: nosniff,
//     X-Frame-Options, Cross-Origin-Opener-Policy, ...).
//
// Cross-Origin-Resource-Policy is left at helmet's default (same-origin) on
// purpose. Checked in services/api/src: no route streams or sends file bytes
// (no StreamableFile, res.send/sendFile, static assets). User media is served
// from the object store's public origin, and the admin review view link is a
// signed link on the S3 endpoint; neither goes through this API. JSON read
// through CORS (the apps' fetch/XHR calls) is not blocked by CORP, which only
// applies to no-cors loads. If a route ever serves media bytes, that route
// (not the whole API) needs 'cross-origin'.
//
// The CORS allow-list (cors-options.ts) is unchanged and is registered AFTER
// this so the headers are present on every response, including CORS
// pre-flights and 404s.
export function buildHelmetOptions(env: { NODE_ENV?: string }): HelmetOptions {
  const isProduction = env.NODE_ENV === 'production';
  return {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'none'"],
        'frame-ancestors': ["'none'"],
      },
    },
    strictTransportSecurity: isProduction
      ? { maxAge: 31_536_000, includeSubDomains: true }
      : false,
    referrerPolicy: { policy: 'no-referrer' },
    // xPoweredBy stays at helmet's default (on): helmet REMOVES X-Powered-By.
    // (Setting it to false would disable helmet's removal and leak "Express".)
  };
}

export function securityHeaders(env: { NODE_ENV?: string }) {
  return helmet(buildHelmetOptions(env));
}
