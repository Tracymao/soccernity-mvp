// "Top Bar -- Soccernity" -- the logo-only bar the core auth routes use
// instead of the full site Header (Build Plan Decision Log #172).
//
// Spec pulled directly from the Figma component of the same name (node
// 5146:6636, in the Club Picker "1 Loaded List" frame; the Guardian
// Consent and Verify Email flow frames draw an identical bar),
// "Soccernity-MVP" file weZWWqggy9j13eX8bhFgs6:
//   - 90px tall, full width, --color/background/surface fill
//   - 1px solid --color/icon/inactive bottom border
//   - "Logo -- Soccernity": the logo mark + "Soccernity" wordmark
//     (Montserrat SemiBold ~17.5px, --brand/navy), left edge ~40px in,
//     vertically centred
// No search field, no nav, no auth cluster -- that is the whole component.
// The lockup links to "/" (home), same as the site Header's own brand.
import { Link } from "react-router";
import logoMark from "../assets/icons/soccernity-logo-mark.svg";
import "./AuthTopBar.css";

export default function AuthTopBar() {
  return (
    <header className="sn-auth-topbar">
      <Link to="/" className="sn-auth-topbar__logo" aria-label="Soccernity home">
        <img src={logoMark} alt="" width={28} height={28} />
        <span className="sn-auth-topbar__wordmark">Soccernity</span>
      </Link>
    </header>
  );
}
