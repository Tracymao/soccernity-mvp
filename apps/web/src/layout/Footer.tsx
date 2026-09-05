// Shared site footer. Figma source: the canonical "Footer" frame
// standardized file-wide in Decision Log #209/#210 -- desktop 5213:6816,
// mobile 5543:7662, "Soccernity-MVP" file (weZWWqggy9j13eX8bhFgs6).
//
// Rendered once by FooterLayout (src/layout/FooterLayout.tsx), which wraps
// exactly the routes whose canonical Figma frame carries a footer -- Home,
// Sports Hub, Leaderboard, Blog, Article Detail. Community / Clubs /
// ClubFanPage / Banter have NO footer in their Figma frames (confirmed
// live) and are deliberately left as direct AppShell children. See
// src/app/router.tsx and Decision Log #213.
//
// DRIFT NOTE: this is built to the *canonical* Figma footer, not a copy of
// HomePage.tsx's previous inline footer -- that inline version had drifted
// (no logo mark, no social bar, no bullet separators, no rule). See
// Decision Log #213 and docs/sprint-2-shared-footer-layout-report.md.
//
// The legal links and social icons are non-interactive: there are no
// /terms, /privacy or /contact routes yet (legal pages are unconverted,
// blocked on Decision Log #203), and Soccernity has no published social
// accounts to link to -- rendering them as real links would 404 or
// fabricate a destination. They become real links when those targets
// exist. The social icon SVGs carry their brand-green fill baked in, the
// same convention nav-blog.svg etc. already use.
import logoMark from "../assets/icons/soccernity-logo-mark.svg";
import socialFacebook from "../assets/icons/social-facebook.svg";
import socialInstagram from "../assets/icons/social-instagram.svg";
import socialTwitter from "../assets/icons/social-twitter.svg";
import socialTiktok from "../assets/icons/social-tiktok.svg";
import socialYoutube from "../assets/icons/social-youtube.svg";
import socialLinkedin from "../assets/icons/social-linkedin.svg";
import "./Footer.css";

// Labels are verbatim from the Figma frame's own text nodes.
const SOCIALS: { label: string; icon: string }[] = [
  { label: "facebook", icon: socialFacebook },
  { label: "instagram", icon: socialInstagram },
  { label: "twitter", icon: socialTwitter },
  { label: "Tik Tok", icon: socialTiktok },
  { label: "YouTube", icon: socialYoutube },
  { label: "LinkedIn", icon: socialLinkedin },
];

const LEGAL_LINKS = ["Terms of Service", "Privacy Policy", "Privacy Settings", "Contact Us"];

export default function Footer() {
  return (
    <footer className="sn-footer">
      <div className="sn-footer__wordmark">
        <img src={logoMark} alt="" width={32} height={32} className="sn-footer__logo-mark" />
        <span>Soccernity</span>
      </div>

      <ul className="sn-footer__socials">
        {SOCIALS.map((s) => (
          <li key={s.label} className="sn-footer__social">
            <img src={s.icon} alt="" width={24} height={24} />
            <span>{s.label}</span>
          </li>
        ))}
      </ul>

      <nav className="sn-footer__links" aria-label="Footer">
        {LEGAL_LINKS.map((l) => (
          <span key={l} className="sn-footer__link">
            {l}
          </span>
        ))}
      </nav>

      <div className="sn-footer__rule" aria-hidden="true" />

      <p className="sn-footer__legal">
        Copyright &copy; 2026 Soccernity. All rights reserved. The information contained in Soccernity may not be
        published, broadcast, rewritten, or redistributed without the prior written authority of Soccernity.
      </p>
    </footer>
  );
}
