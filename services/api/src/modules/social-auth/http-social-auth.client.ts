import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuthorizationUrlParams,
  ExchangeCodeParams,
  SocialAuthClient,
  SocialProfile,
} from './social-auth.client';
import { FACEBOOK_GRAPH_VERSION, SOCIAL_PROVIDER_TIMEOUT_MS, SocialProvider } from './social-auth.constants';

// The scopes asked of each provider. IDENTITY ONLY: nothing about birthday, age range, gender, friends, location or
// contacts is requested, so nothing of the sort can come back. (A test pins that these strings stay this narrow.)
export const GOOGLE_SCOPES = 'openid email profile';
export const FACEBOOK_SCOPES = 'public_profile,email';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

const isPlaceholder = (value: string | undefined): boolean => {
  const v = value?.trim();
  return !v || v === 'replace-me';
};

interface ProviderKeys {
  clientId: string;
  clientSecret: string;
}

// The real OAuth 2.0 authorisation-code + PKCE client for Google and Facebook, over the runtime's built-in fetch (no
// new dependency). It runs the code exchange back-channel over TLS and then reads the profile with the access token, so
// there is no id_token to validate and no nonce to check.
//
// NOT VERIFIED AGAINST A REAL PROVIDER: no Google or Facebook OAuth app exists yet, so none of this has run against a
// live endpoint. The URLs, parameters and field names are taken from the providers' public documentation as read when
// this was written. Facebook is the less certain of the two (PKCE parameters on its token endpoint; the Graph
// version). See README.md.
@Injectable()
export class HttpSocialAuthClient extends SocialAuthClient {
  private readonly logger = new Logger(HttpSocialAuthClient.name);
  private readonly keys: Partial<Record<SocialProvider, ProviderKeys>> = {};

  constructor(config: ConfigService) {
    super();
    const read = (provider: SocialProvider, idVar: string, secretVar: string) => {
      const clientId = config.get<string>(idVar);
      const clientSecret = config.get<string>(secretVar);
      if (!isPlaceholder(clientId) && !isPlaceholder(clientSecret)) {
        this.keys[provider] = { clientId: clientId!.trim(), clientSecret: clientSecret!.trim() };
      }
    };
    read('google', 'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET');
    read('facebook', 'FACEBOOK_OAUTH_CLIENT_ID', 'FACEBOOK_OAUTH_CLIENT_SECRET');
    for (const provider of ['google', 'facebook'] as const) {
      if (!this.keys[provider]) {
        this.logger.warn(
          `[social-auth] ${provider} OAuth keys not set — wired but inactive. Its sign-in endpoints answer "not available".`,
        );
      }
    }
  }

  isConfigured(provider: SocialProvider): boolean {
    return this.keys[provider] !== undefined;
  }

  buildAuthorizationUrl(provider: SocialProvider, params: AuthorizationUrlParams): string {
    const keys = this.requireKeys(provider);
    const url = new URL(
      provider === 'google' ? GOOGLE_AUTH_URL : `https://www.facebook.com/${FACEBOOK_GRAPH_VERSION}/dialog/oauth`,
    );
    url.searchParams.set('client_id', keys.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', provider === 'google' ? GOOGLE_SCOPES : FACEBOOK_SCOPES);
    url.searchParams.set('state', params.state);
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    if (provider === 'google') url.searchParams.set('prompt', 'select_account');
    return url.toString();
  }

  async exchangeCode(provider: SocialProvider, params: ExchangeCodeParams): Promise<SocialProfile> {
    const keys = this.requireKeys(provider);
    return provider === 'google' ? this.googleProfile(keys, params) : this.facebookProfile(keys, params);
  }

  private requireKeys(provider: SocialProvider): ProviderKeys {
    const keys = this.keys[provider];
    if (!keys) throw new Error(`${provider} OAuth is not configured`);
    return keys;
  }

  private async googleProfile(keys: ProviderKeys, p: ExchangeCodeParams): Promise<SocialProfile> {
    const token = await this.postForm<{ access_token?: string }>(GOOGLE_TOKEN_URL, {
      code: p.code,
      client_id: keys.clientId,
      client_secret: keys.clientSecret,
      redirect_uri: p.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: p.codeVerifier,
    });
    if (!token.access_token) throw new Error('Google returned no access token');
    const info = await this.getJson<{ sub?: string; name?: string; email?: string; email_verified?: boolean | string }>(
      GOOGLE_USERINFO_URL,
      { Authorization: `Bearer ${token.access_token}` },
    );
    if (!info.sub) throw new Error('Google returned no subject');
    const email = typeof info.email === 'string' && info.email.trim() ? info.email.trim().toLowerCase() : null;
    return {
      provider: 'google',
      providerAccountId: info.sub,
      displayName: cleanName(info.name, email),
      email,
      // Google sends a boolean; tolerate the string form some libraries/versions return. Anything else is NOT verified.
      emailVerified: email !== null && (info.email_verified === true || info.email_verified === 'true'),
    };
  }

  private async facebookProfile(keys: ProviderKeys, p: ExchangeCodeParams): Promise<SocialProfile> {
    const graph = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}`;
    const tokenUrl = new URL(`${graph}/oauth/access_token`);
    tokenUrl.searchParams.set('client_id', keys.clientId);
    tokenUrl.searchParams.set('client_secret', keys.clientSecret);
    tokenUrl.searchParams.set('redirect_uri', p.redirectUri);
    tokenUrl.searchParams.set('code', p.code);
    tokenUrl.searchParams.set('code_verifier', p.codeVerifier);
    const token = await this.getJson<{ access_token?: string }>(tokenUrl.toString());
    if (!token.access_token) throw new Error('Facebook returned no access token');
    const meUrl = new URL(`${graph}/me`);
    // Only these three fields are requested. NOT birthday, age_range or gender.
    meUrl.searchParams.set('fields', 'id,name,email');
    const me = await this.getJson<{ id?: string; name?: string; email?: string }>(meUrl.toString(), {
      Authorization: `Bearer ${token.access_token}`,
    });
    if (!me.id) throw new Error('Facebook returned no user id');
    const email = typeof me.email === 'string' && me.email.trim() ? me.email.trim().toLowerCase() : null;
    return {
      provider: 'facebook',
      providerAccountId: me.id,
      displayName: cleanName(me.name, email),
      email,
      // Facebook never says whether the address is verified, so it is always treated as UNVERIFIED (adopted default (b)):
      // it goes through Soccernity's own verification email like any other.
      emailVerified: false,
    };
  }

  private async postForm<T>(url: string, form: Record<string, string>): Promise<T> {
    return this.request<T>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(form).toString(),
    });
  }

  private async getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
    return this.request<T>(url, { method: 'GET', headers: { Accept: 'application/json', ...headers } });
  }

  // Never logs the URL (a Facebook token request carries the client secret and the code in its query string) or the
  // response body (it holds the person's profile): the status alone is enough to debug.
  private async request<T>(url: string, init: NonNullable<Parameters<typeof fetch>[1]>): Promise<T> {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(SOCIAL_PROVIDER_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`provider responded ${res.status}`);
    return (await res.json()) as T;
  }
}

// A display name is always needed to create the account; fall back to the start of the email, then a neutral word.
function cleanName(name: string | undefined, email: string | null): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed.slice(0, 100);
  if (email) return email.split('@')[0].slice(0, 100);
  return 'New member';
}
