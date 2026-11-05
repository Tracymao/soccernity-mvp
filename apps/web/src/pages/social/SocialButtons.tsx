// The "Or continue with" block of Login and Register (B-085; Figma "Social Sign-In" 5418:7141, Login 1625:2303 and
// Register 1625:2333; hidden state 6965:46142 / 6965:46204).
//
// Which buttons exist is decided by the API, not by this app: GET /auth/social/providers lists the providers whose
// keys are set. With none enabled (the launch default, until the founder adds the OAuth keys) this component renders
// NOTHING: no divider, no heading, no gap, exactly as the "hidden" frames draw it. Apple has no button anywhere
// (Decision Log #378, #468). A failed providers request is treated as "none".
import { useEffect, useState } from "react";
import {
  SOCIAL_PROVIDER_LABELS,
  getEnabledSocialProviders,
  type SocialProvider,
} from "../../api/socialAuth";
import { beginSocialSignIn } from "../../lib/socialSignIn";
import googleLogo from "../../assets/social/google-logo.svg";
import facebookLogo from "../../assets/social/facebook-logo.svg";
import "./social.css";

const LOGOS: Record<SocialProvider, { src: string; width: number; height: number }> = {
  google: { src: googleLogo, width: 18, height: 18 },
  facebook: { src: facebookLogo, width: 18.294, height: 18.6207 },
};

interface Props {
  /** The "Stay signed in" choice made on the page; applied if the callback signs the person in. */
  staySignedIn?: boolean;
}

export default function SocialButtons({ staySignedIn = false }: Props) {
  const [providers, setProviders] = useState<SocialProvider[]>([]);
  const [starting, setStarting] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<SocialProvider | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getEnabledSocialProviders().then((enabled) => {
      if (!cancelled) setProviders(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (providers.length === 0) return null;

  async function start(provider: SocialProvider) {
    setError(null);
    setStarting(provider);
    try {
      await beginSocialSignIn(provider, staySignedIn);
      // The browser is now leaving for the provider; nothing more to do here.
    } catch {
      setStarting(null);
      setError(provider);
    }
  }

  return (
    <div className="social-block" data-testid="social-buttons">
      <div className="social-divider" role="presentation">
        <span className="social-divider__line" />
        <span className="social-divider__text">Or continue with</span>
        <span className="social-divider__line" />
      </div>
      {providers.map((provider) => {
        const logo = LOGOS[provider];
        return (
          <button
            key={provider}
            type="button"
            className="social-button"
            disabled={starting !== null}
            onClick={() => void start(provider)}
          >
            <img src={logo.src} width={logo.width} height={logo.height} alt="" />
            Continue with {SOCIAL_PROVIDER_LABELS[provider]}
          </button>
        );
      })}
      {error && (
        <p className="social-error" role="alert">
          <span className="social-error__bar" aria-hidden="true" />
          Couldn&rsquo;t start the sign-in with {SOCIAL_PROVIDER_LABELS[error]}. Please try again.
        </p>
      )}
    </div>
  );
}
