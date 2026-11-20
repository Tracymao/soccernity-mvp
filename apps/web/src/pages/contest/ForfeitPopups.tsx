// The forfeit pop-up (Decision Log #400 E11, #403 item 9, #404 item 4; Figma 6671:28756 desktop /
// 6671:28764 mobile). Shown on the Contest page ONLY -- the Contest details page and the Voting page
// -- on EVERY load, one pop-up per forfeited week, OLDEST WEEK FIRST, one after another, the reason
// shown, nothing remembered between loads. The leaderboard Contest tab shows no pop-up (it writes
// "Forfeited" in place of the three names instead).
//
// The reason text comes from the API (it is the single source of the wording); the second sentence
// states the consequence. Nothing is stored in localStorage or anywhere else: a reload shows the
// pop-ups again by design.
import { useEffect, useRef, useState } from "react";
import type { ContestForfeitedWeek } from "../../api/contest";
import "./ForfeitPopups.css";

export default function ForfeitPopups({ weeks }: { weeks: ContestForfeitedWeek[] }) {
  const [index, setIndex] = useState(0);
  const okRef = useRef<HTMLButtonElement>(null);
  const ordered = [...weeks].sort((a, b) => a.weekNumber - b.weekNumber);
  const current = ordered[index];

  useEffect(() => {
    okRef.current?.focus();
  }, [index, current]);

  if (!current) return null;

  return (
    <div className="forfeit-scrim" data-testid="forfeit-popup">
      <div className="forfeit-dialog" role="alertdialog" aria-modal="true" aria-labelledby="forfeit-title" aria-describedby="forfeit-body">
        <span className="forfeit-dialog__bar" aria-hidden="true" />
        <h2 className="forfeit-dialog__title" id="forfeit-title">
          Week {current.weekNumber} was forfeited
        </h2>
        <p className="forfeit-dialog__body" id="forfeit-body">
          {current.reason} No winners were chosen, and no placement points were awarded.
        </p>
        <button type="button" className="forfeit-dialog__ok" onClick={() => setIndex((i) => i + 1)} ref={okRef}>
          OK
        </button>
      </div>
    </div>
  );
}
