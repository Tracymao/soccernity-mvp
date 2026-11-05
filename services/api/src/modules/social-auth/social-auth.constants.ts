// B-084 (Decision Log #378, #468). Social sign-in with Google and Facebook, backend only, BUILT BEHIND CONFIGURATION.
// Apple is out of scope. The rules and the adopted defaults are in README.md.

export const SOCIAL_PROVIDERS = ['google', 'facebook'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export function isSocialProvider(value: unknown): value is SocialProvider {
  return typeof value === 'string' && (SOCIAL_PROVIDERS as readonly string[]).includes(value);
}

// The OAuth round trip: the state (and the PKCE verifier it carries) lives this long between "start" and "callback".
export const SOCIAL_STATE_TTL_SECONDS = 10 * 60;

// The social registration token: after a provider has proved who the person is and before the account exists
// (Age Gate, guardian details, terms, ...). Single purpose: it can be spent on POST /auth/social/register and on the
// two email-code routes, and on nothing else (it is not a JWT and no guard accepts it).
export const SOCIAL_REGISTRATION_TTL_SECONDS = 30 * 60;

// An account that has no email from the provider (Facebook can return none) must verify one BEFORE any account exists.
export const SOCIAL_EMAIL_CODE_TTL_SECONDS = 10 * 60;
export const SOCIAL_EMAIL_CODE_LENGTH = 6;
// Wrong guesses allowed on one code before it is discarded and a new one has to be requested.
export const SOCIAL_EMAIL_CODE_MAX_ATTEMPTS = 5;
// Codes that may be SENT for one registration token within its lifetime (an email-bombing and cost cap).
export const SOCIAL_EMAIL_CODE_MAX_SENDS = 3;

// Time allowed for each call to the provider; a slow provider must never hold a request open.
export const SOCIAL_PROVIDER_TIMEOUT_MS = 8_000;

// Facebook Graph API version. UNVERIFIED against a live app (no Facebook app exists yet): Graph versions expire after
// about two years, so confirm the current one when the keys are added. See README.md "Not verified against a real
// provider".
export const FACEBOOK_GRAPH_VERSION = 'v21.0';

// Machine-readable codes the web branches on (never the message text).
export const SOCIAL_PROVIDER_UNAVAILABLE_CODE = 'social_provider_unavailable';
export const SOCIAL_AUTH_FAILED_CODE = 'social_auth_failed';
export const SOCIAL_REGISTRATION_INVALID_CODE = 'social_registration_invalid';
export const SOCIAL_EMAIL_NOT_NEEDED_CODE = 'social_email_not_needed';
export const SOCIAL_EMAIL_REQUIRED_CODE = 'social_email_required';
export const SOCIAL_EMAIL_CODE_INVALID_CODE = 'social_email_code_invalid';
export const SOCIAL_EMAIL_CODE_RATE_LIMITED_CODE = 'social_email_code_rate_limited';
