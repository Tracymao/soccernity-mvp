import { SocialProvider } from './social-auth.constants';

// What the provider told us about the person. Read once, in memory, during the callback; only `providerAccountId` is ever
// stored (SocialIdentity). `email` is null when the provider gave none. `emailVerified` is the PROVIDER's claim:
// Google reports it; Facebook never does, so its emails are always reported unverified (adopted default (b)).
//
// There is deliberately no date of birth, birthday, age range or gender here: the clients never request those
// permissions, and the Age Gate is the only source of a date of birth.
export interface SocialProfile {
  provider: SocialProvider;
  providerAccountId: string;
  displayName: string;
  email: string | null;
  emailVerified: boolean;
}

export interface AuthorizationUrlParams {
  state: string;
  codeChallenge: string;
  redirectUri: string;
}

export interface ExchangeCodeParams {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

// The one external dependency of social sign-in, behind an abstract class (the MediaModerationClient pattern) so the
// service logic is tested against an in-memory fake and the tests never reach the network. The real implementation
// (HttpSocialAuthClient) is bound in SocialAuthModule and activates only when a provider's keys are set.
export abstract class SocialAuthClient {
  /** True only when this provider's client id AND secret are set (not blank, not the `replace-me` placeholder). */
  abstract isConfigured(provider: SocialProvider): boolean;

  /** The URL to send the browser to. Carries the state and the PKCE S256 challenge. */
  abstract buildAuthorizationUrl(provider: SocialProvider, params: AuthorizationUrlParams): string;

  /** Exchanges the authorisation code (with the PKCE verifier) for the person's profile. Throws on ANY failure. */
  abstract exchangeCode(provider: SocialProvider, params: ExchangeCodeParams): Promise<SocialProfile>;
}
