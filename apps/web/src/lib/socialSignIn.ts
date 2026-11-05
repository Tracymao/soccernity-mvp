// The browser half of the OAuth round trip (B-085; contract in services/api modules/social-auth/README.md).
//
// The API makes `state` single-use and server-held but cannot know which BROWSER started a flow. To stop login CSRF
// (an attacker starts a flow, then gets a victim's browser to finish it, signing the victim in as the attacker) this
// browser keeps the `state` the server returned from "start" and the callback page refuses to call the API unless the
// `state` in the provider's redirect equals it. It is kept in sessionStorage (it must survive the trip to the
// provider and back). It is not a credential: it is already in the provider's URL and is spent by the first callback.
import { startSocialSignIn, type SocialProvider } from "../api/socialAuth";

const KEY = "sn_social_pending";

interface Pending {
  provider: SocialProvider;
  state: string;
  staySignedIn: boolean;
}

export function savePendingSocialSignIn(pending: Pending): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(pending));
  } catch {
    /* storage unavailable: the callback will find nothing and refuse, which is the safe outcome */
  }
}

// Reads AND removes the pending entry: it can be used once.
export function takePendingSocialSignIn(): Pending | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Pending>;
    if (typeof value.state === "string" && typeof value.provider === "string") {
      return { provider: value.provider, state: value.state, staySignedIn: value.staySignedIn === true };
    }
  } catch {
    /* fall through */
  }
  return null;
}

// Starts the redirect: asks the API for the provider's authorisation URL, remembers its `state`, and sends the
// browser there. Throws (AuthApiError) if the API refuses; the caller shows a message.
export async function beginSocialSignIn(provider: SocialProvider, staySignedIn: boolean): Promise<void> {
  const { authorizationUrl } = await startSocialSignIn(provider, staySignedIn);
  const state = new URL(authorizationUrl).searchParams.get("state");
  if (!state) throw new Error("The authorisation URL carried no state.");
  savePendingSocialSignIn({ provider, state, staySignedIn });
  window.location.assign(authorizationUrl);
}
