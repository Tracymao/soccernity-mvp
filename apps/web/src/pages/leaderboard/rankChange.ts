// The 7-day change figure on the Overall board (B-053, Decision Log #472).
//
// GET /leaderboard returns `rankChange7d` = the person's rank NOW minus their rank on the same board seven
// days earlier, so the sign is the opposite of what a reader expects: a NEGATIVE number means the person
// moved UP the board. `null` means they were not on that board seven days ago; the API never makes up a 0
// for that, and neither does this file.
//
// Display, per the Figma frames (5171:6633 and 5540:7264): plain, monochrome text. The frames carry a note
// that the change is never colour-coded (the palette has no red or negative token), so direction is shown
// by an arrow glyph and a number only.
//   - negative -> an up arrow and the number of places gained
//   - positive -> a down arrow and the number of places lost
//   - zero     -> "0", no arrow (a real "same rank both times")
//   - null     -> a dash, no arrow (what the frames draw where there is no figure; no frame draws a
//                 separate "new entry" mark)

export type RankChangeDirection = "up" | "down" | "same" | "none";

export interface RankChangeView {
  direction: RankChangeDirection;
  // "▲", "▼" or null when no arrow is drawn.
  arrow: string | null;
  // The number or dash shown next to the arrow.
  figure: string;
  // Accessible description, since the glyph and the number alone do not say what they measure.
  label: string;
}

function places(count: number): string {
  return count === 1 ? "1 place" : `${count} places`;
}

export function describeRankChange(rankChange7d: number | null | undefined): RankChangeView {
  if (rankChange7d === null || rankChange7d === undefined || !Number.isFinite(rankChange7d)) {
    return { direction: "none", arrow: null, figure: "—", label: "No rank change figure for the last 7 days" };
  }
  if (rankChange7d === 0) {
    return { direction: "same", arrow: null, figure: "0", label: "Rank unchanged over the last 7 days" };
  }
  const moved = Math.abs(rankChange7d);
  if (rankChange7d < 0) {
    return { direction: "up", arrow: "▲", figure: String(moved), label: `Up ${places(moved)} over the last 7 days` };
  }
  return { direction: "down", arrow: "▼", figure: String(moved), label: `Down ${places(moved)} over the last 7 days` };
}
