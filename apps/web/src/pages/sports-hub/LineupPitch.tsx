// CH-H21 -- the Lineups pitch and the paired home / away rows (Figma 667:1952).
//
// ORDERING RELIED ON: `TeamLineup.rows` is the provider's `initialLineup` passed through unchanged
// (services/api sports.service.ts getLineups). The first row is the goalkeeper and each later row is one
// formation line, defence to attack (Highlightly's lineups docs; see also RawLineupTeam's comment). The
// order of players WITHIN a row is not documented; it is kept exactly as sent, and the away side is drawn
// mirrored so the two teams face each other.
//
// Layout is CSS only: home on the left and away on the right at 700px and wider, stacked below that.
// The shirts use two tokens (navy home, green away) because the data carries no kit colours.
import type { LineupPlayer, TeamLineup } from "../../api/sports";

// A formation we can draw: "4-4-2", "4-2-3-1" and so on, with matching rows from the provider.
export function canDrawPitch(lineup: TeamLineup): boolean {
  return /^\d(-\d)+$/.test(lineup.formation ?? "") && lineup.rows.length > 1 && lineup.rows.every((r) => r.length > 0);
}

const NAME_PARTICLES = new Set(["van", "von", "de", "der", "den", "da", "di", "del", "dos", "el", "al", "le", "la", "mac"]);

export function surname(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name.trim();
  let start = parts.length - 1;
  while (start > 1 && NAME_PARTICLES.has(parts[start - 1].toLowerCase())) start -= 1;
  // "Garcia J." -- an initial at the end is not the surname.
  if (/^\p{L}\.$/u.test(parts[parts.length - 1])) return parts.slice(0, -1).join(" ");
  return parts.slice(start).join(" ");
}

function PitchSide({ lineup, side }: { lineup: TeamLineup; side: "home" | "away" }) {
  // 1 to 11 across the whole side, for the staggered entrance in the stylesheet.
  const before = lineup.rows.map((_, ri) => lineup.rows.slice(0, ri).reduce((n, r) => n + r.length, 0));
  return (
    <ol className={`mc-pitch__half mc-pitch__half--${side}`} aria-label={`${lineup.team.name} starting formation`}>
      {lineup.rows.map((row, ri) => (
        <li key={ri} className="mc-pitch__line">
          {row.map((p, pi) => (
            <span key={p.id ?? pi} className="mc-pitch__player" data-order={Math.min(before[ri] + pi + 1, 11)} title={p.name}>
              <span className="mc-pitch__shirt">
                <svg viewBox="0 0 32 30" aria-hidden="true">
                  <path d="M10 1 L1 7 L4 14 L8 12 L8 29 L24 29 L24 12 L28 14 L31 7 L22 1 C20 5 12 5 10 1 Z" />
                </svg>
                <span className="mc-pitch__number">{p.number ?? ""}</span>
              </span>
              <span className="mc-pitch__name">{surname(p.name)}</span>
            </span>
          ))}
        </li>
      ))}
    </ol>
  );
}

export function LineupPitch({ home, away }: { home: TeamLineup; away: TeamLineup }) {
  return (
    <>
      <div className="mc-band mc-band--formation">
        <span>
          <span className="mc-visually-hidden">{home.team.name} formation </span>
          {home.formation}
        </span>
        <span>Formation</span>
        <span>
          <span className="mc-visually-hidden">{away.team.name} formation </span>
          {away.formation}
        </span>
      </div>
      <div className="mc-pitch-legend">
        <span className="mc-pitch-legend__team mc-pitch-legend__team--home">{home.team.name}</span>
        <span className="mc-pitch-legend__team mc-pitch-legend__team--away">{away.team.name}</span>
      </div>
      <div className="mc-pitch">
        <PitchSide lineup={home} side="home" />
        <PitchSide lineup={away} side="away" />
      </div>
    </>
  );
}

function PairCell({ player, side }: { player: LineupPlayer | undefined; side: "home" | "away" }) {
  return (
    <span className={`mc-pairs__cell mc-pairs__cell--${side}`}>
      {player && (
        <>
          {player.number != null && <span className="mc-pairs__number">{player.number}</span>}
          <span className="mc-pairs__name">{player.name}</span>
        </>
      )}
    </span>
  );
}

export function PairedRows({ title, home, away }: { title: string; home: LineupPlayer[]; away: LineupPlayer[] }) {
  const length = Math.max(home.length, away.length);
  if (length === 0) return null;
  return (
    <div className="mc-pairs">
      <h3 className="mc-band">{title}</h3>
      <ul>
        {Array.from({ length }, (_, i) => (
          <li key={i}>
            <PairCell player={home[i]} side="home" />
            <PairCell player={away[i]} side="away" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function coachRows(lineup: TeamLineup): LineupPlayer[] {
  return lineup.coach ? [{ id: null, name: lineup.coach, number: null, position: null }] : [];
}
