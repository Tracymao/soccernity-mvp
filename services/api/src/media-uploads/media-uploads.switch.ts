// backend/b306-media-uploads-switch (B-306; Decision Log #501, #462 (g)). THE ONE place that decides whether
// users may upload images and video. Every gate (the guard in media-uploads-enabled.guard.ts) and the boot
// warning read this function; nothing else re-implements the rule.
//
// The rule (stated by the founder, Decision Log #501):
//   - NODE_ENV === "production" (Render sets this on staging too): OFF unless the value is exactly "true".
//     A typo ("TRUE", "1", "yes", empty, unset) leaves it off.
//   - any other NODE_ENV (development, test, unset): ON unless the value is exactly "false".
// The founder sets MEDIA_UPLOADS_ENABLED to "true" in Render by hand, at the launch gate, only after counsel's
// written answer on B-206 (render.yaml, docs/deployment.md).

export const MEDIA_UPLOADS_ENABLED_ENV = 'MEDIA_UPLOADS_ENABLED';
export const MEDIA_UPLOADS_DISABLED_CODE = 'media_uploads_disabled';

export function isMediaUploadsEnabled(value: string | undefined, nodeEnv: string | undefined): boolean {
  if (nodeEnv === 'production') return value === 'true';
  return value !== 'false';
}
