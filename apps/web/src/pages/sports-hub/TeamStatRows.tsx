// CH-H21 -- team statistics as two-sided bars (Figma 640:3737): label centred, home value at the left
// edge, away value at the right edge, both bars growing from the centre. Home is navy, away green, the smaller value in the lighter tone.
import type { StatisticItem } from "../../api/sports";

// Figma's order. Each entry lists the spellings accepted for one Figma row, because the provider's real
// labels are not confirmed. Anything not listed here follows, in the order the provider sent it.
const FIGMA_ORDER: readonly (readonly string[])[] = [
  ["ballpossession", "possession"],
  ["goalattempts", "totalshots", "shots", "shotstotal"],
  ["shotsontarget", "shotsontargets", "shotsongoal"],
  ["shotsoffgoal", "shotsofftarget"],
  ["blockedshots"],
  ["freekicks"],
  ["cornerkicks", "corners"],
  ["offsides"],
  ["throwin", "throwins"],
  ["goalkeepersaves", "saves"],
  ["fouls"],
  ["redcards", "redcard"],
  ["yellowcards", "yellowcard"],
  ["totalpasses", "passes"],
  ["completedpasses", "successfulpasses", "passessuccessful", "accuratepasses"],
  ["tackles"],
  ["attacks"],
  ["dangerousattacks"],
];

function rankOf(label: string): number {
  const key = label.toLowerCase().replace(/[^a-z]/g, "");
  const index = FIGMA_ORDER.findIndex((names) => names.includes(key));
  return index === -1 ? FIGMA_ORDER.length : index;
}

// A number, or a numeric string such as "58%". Anything else draws no bar.
function toNumber(value: number | string | null): number | null {
  if (typeof value === "number") return value;
  const match = typeof value === "string" ? /^\s*(\d+(?:\.\d+)?)\s*%?\s*$/.exec(value) : null;
  return match ? Number(match[1]) : null;
}

export default function TeamStatRows({ home, away }: { home: StatisticItem[]; away: StatisticItem[] }) {
  const awayByLabel = new Map(away.map((s) => [s.label, s.value]));
  // Array sort is stable, so unlisted labels keep the provider's order.
  const rows = [...home].sort((a, b) => rankOf(a.label) - rankOf(b.label));

  return (
    <ul className="mc-compare">
      {rows.map((row) => {
        const awayValue = awayByLabel.get(row.label) ?? null;
        const h = toNumber(row.value) ?? 0;
        const a = toNumber(awayValue) ?? 0;
        const total = h + a;
        const side = (name: "home" | "away", own: number, other: number) => (
          <span className={`mc-compare__track mc-compare__track--${name}`}>
            <span
              className={`mc-compare__fill${own > other ? " mc-compare__fill--lead" : own < other ? " mc-compare__fill--trail" : ""}`}
              style={{ width: `${total > 0 ? (own / total) * 100 : 0}%` }}
            />
          </span>
        );
        return (
          <li key={row.label}>
            <div className="mc-compare__head">
              <span className="mc-compare__value">{row.value ?? "—"}</span>
              <span className="mc-compare__label">{row.label}</span>
              <span className="mc-compare__value mc-compare__value--away">{awayValue ?? "—"}</span>
            </div>
            <div className="mc-compare__bars" aria-hidden="true">
              {side("home", h, a)}
              {side("away", a, h)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
