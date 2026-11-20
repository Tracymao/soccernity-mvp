// Contest Rules modal. Figma source: "Contest — Rules — Modal — Desktop"
// (6241:14657) / "— Mobile" (6241:14677), "Soccernity-MVP" file
// (weZWWqggy9j13eX8bhFgs6). Opened by the "Contest rules ›" link on
// ContestPage.tsx (Figma nodes 6245:14767 desktop / 6245:14768 mobile).
//
// INTENTIONAL PLACEHOLDER — DO NOT "FIX": this modal ships with a visible
// "[PLACEHOLDER — founder to supply final Contest Rules copy...]" block.
// Per the founder's explicit, deliberately-different-from-ToS/Privacy
// decision (Decision Log #227), the real Contest Rules copy is written and
// owned by the founder directly and there is NO legal-counsel review track
// for it — so this is not blocked on counsel and is meant to ship with the
// placeholder visible until the founder supplies the copy. Do not remove or
// soften the "founder to supply" marking, and do not write rules copy here.
//
// Follows EditProfileModal.tsx's overlay + card pattern (scrim onClick to
// close, card stopPropagation), plus role="dialog" / aria-modal / Escape.
import { useEffect, useRef } from "react";
import "./ContestRulesModal.css";

interface ContestRulesModalProps {
  onClose: () => void;
}

export default function ContestRulesModal({ onClose }: ContestRulesModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="contest-rules-overlay"
      onClick={onClose}
      data-testid="contest-rules-overlay"
    >
      <div
        className="contest-rules-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contest-rules-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="contest-rules-modal__header">
          <h2 className="contest-rules-modal__title" id="contest-rules-title">
            Contest rules
          </h2>
          <button
            type="button"
            className="contest-rules-modal__close"
            onClick={onClose}
            aria-label="Close"
            ref={closeRef}
          >
            &times;
          </button>
        </div>

        <div className="contest-rules-modal__body">
          <div className="contest-rules-placeholder">
            <p className="contest-rules-placeholder__lead">
              [PLACEHOLDER &mdash; founder to supply final Contest Rules copy before this ships]
            </p>
            <p className="contest-rules-placeholder__note">
              This modal is a structural shell only. The Contest Rules copy is written and owned
              by the founder directly &mdash; there is no legal-counsel review track for this
              content (unlike the Terms of Service / Privacy Policy).
            </p>
          </div>
          <p className="contest-rules-modal__scroll-note">
            This body area scrolls vertically when the final rules content is longer than the
            modal.
          </p>
        </div>
      </div>
    </div>
  );
}
