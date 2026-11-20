// Coming Soon — reusable template. Figma source: "Coming Soon — Desktop —
// Logged In" (6477:20050) / "— Desktop — Logged Out" (6477:20402) /
// "— Mobile — Logged In" (6477:20677) / "— Mobile — Logged Out"
// (6477:20764), "Soccernity-MVP" file (weZWWqggy9j13eX8bhFgs6),
// Decision Log #285.
//
// One reusable component, not two duplicated page files. The four Figma
// frames are identical in content across breakpoint and auth state — the
// only thing that differs is the shared site chrome (Header/Footer), which
// AppShell/FooterLayout already provide for every route — so this renders
// just the body: icon disc, "COMING SOON" badge, feature name, a fixed
// generic sub-line, and a "Back to Soccernity" CTA. /scouting and
// /academy (router.tsx) both point at this same component, configured
// with a different `featureName` prop, per Decision Log #284's two
// reserved navbar slots (Scouting, Academy — the navbar's last two icons,
// standing policy: no further additions by default).
//
// No feature-specific content is rendered for either pillar beyond its
// name — there is nothing to show yet (non-negotiable #4 / Decision Log
// #3, Phase 2, not MVP-blocking). Sub-line copy is verbatim from the
// Figma frame's own text node (6477:20169).
import { Link } from "react-router";
import comingSoonIcon from "../assets/icons/coming-soon-icon.svg";
import "./coming-soon/ComingSoonPage.css";

export interface ComingSoonPageProps {
  /** Rendered as the page's H1 — e.g. "Scouting" or "Academy". */
  featureName: string;
}

export default function ComingSoonPage({ featureName }: ComingSoonPageProps) {
  return (
    <div className="cs-page">
      <img src={comingSoonIcon} alt="" width={96} height={96} className="cs-page__icon" />
      <span className="cs-page__badge">COMING SOON</span>
      <h1 className="cs-page__title">{featureName}</h1>
      <p className="cs-page__body">
        This feature is part of our Phase 2 roadmap and isn&apos;t built yet. Check back soon.
      </p>
      <Link to="/" className="cs-page__cta">
        Back to Soccernity
      </Link>
    </div>
  );
}
