// CH-H21 -- the per-player table from the box score (Figma 640:3737). Columns in Figma's order; a column
// no player has a value for is not drawn, and the table is not drawn at all when the box score carries
// nothing beyond minutes.
import { useState } from "react";
import type { BoxScorePlayer, TeamBoxScore } from "../../api/sports";

type ColumnKey =
  | "minutesPlayed"
  | "goals"
  | "assists"
  | "shots"
  | "shotsOnTarget"
  | "passes"
  | "passAccuracy"
  | "tackles"
  | "fouls";

const COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "minutesPlayed", label: "Min" },
  { key: "goals", label: "G" },
  { key: "assists", label: "A" },
  { key: "shots", label: "Shots" },
  { key: "shotsOnTarget", label: "On target" },
  { key: "passes", label: "Passes" },
  { key: "passAccuracy", label: "Pass %" },
  { key: "tackles", label: "Tackles" },
  { key: "fouls", label: "Fouls" },
];

function cell(player: BoxScorePlayer, key: ColumnKey): string {
  const value = player[key];
  if (value == null) return "—";
  return key === "passAccuracy" ? `${Math.round(value)}%` : String(value);
}

export default function PlayerStatsTable({ home, away }: { home: TeamBoxScore; away: TeamBoxScore }) {
  const [side, setSide] = useState<"home" | "away">("home");
  const everyone = [...home.players, ...away.players];
  const columns = COLUMNS.filter((c) => everyone.some((p) => p[c.key] != null));
  if (!columns.some((c) => c.key !== "minutesPlayed")) return null;

  const team = side === "home" ? home : away;
  const starters = team.players.filter((p) => !p.isSubstitute);
  // Substitutes who came on.
  const subs = team.players.filter((p) => p.isSubstitute && (p.minutesPlayed ?? 0) > 0);

  const playerRow = (p: BoxScorePlayer, i: number) => (
    <tr key={p.id ?? i}>
      <th scope="row">
        {p.position && <span className="mc-player-table__position">{p.position}</span>}
        {p.name}
      </th>
      {columns.map((c) => (
        <td key={c.key}>{cell(p, c.key)}</td>
      ))}
    </tr>
  );

  return (
    <section className="mc-section">
      <h3 className="mc-band">Player statistics</h3>
      <div className="mc-player-toggle" role="group" aria-label="Team">
        {(["home", "away"] as const).map((s) => (
          <button key={s} type="button" aria-pressed={side === s} onClick={() => setSide(s)}>
            {(s === "home" ? home : away).team.name}
          </button>
        ))}
      </div>
      <div className="mc-player-table-wrap" role="region" aria-label="Player statistics table" tabIndex={0}>
        <table className="mc-player-table">
          <thead>
            <tr>
              <th scope="col">Player</th>
              {columns.map((c) => (
                <th key={c.key} scope="col">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {starters.map(playerRow)}
            {subs.length > 0 && (
              <tr className="mc-player-table__divider">
                <th colSpan={columns.length + 1} scope="colgroup">
                  Substitutes
                </th>
              </tr>
            )}
            {subs.map(playerRow)}
          </tbody>
        </table>
      </div>
    </section>
  );
}
