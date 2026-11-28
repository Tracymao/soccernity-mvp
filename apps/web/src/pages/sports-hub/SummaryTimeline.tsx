// CH-H21 -- the two half bands and their events (Figma 632:943). Home events sit on the left, away
// events on the right, with the minute on the outer edge. An event type this file does not know is
// written out with its type, never dropped.
import type { MatchEvent, MatchSummary } from "../../api/sports";
import { buildSummary, eventKind, playerOff, type Score, type SummaryHalf, type SummaryKind } from "./matchSummaryEvents";

const KIND_LABEL: Record<Exclude<SummaryKind, "other">, string> = {
  goal: "Goal",
  penalty: "Penalty goal",
  "own-goal": "Own goal",
  yellow: "Yellow card",
  red: "Red card",
  substitution: "Substitution",
};

const isGoalKind = (kind: SummaryKind) => kind === "goal" || kind === "penalty" || kind === "own-goal";

function EventIcon({ kind }: { kind: SummaryKind }) {
  if (kind === "other") return null;
  return (
    <span className={`mc-event__icon mc-event__icon--${kind}`} role="img" aria-label={KIND_LABEL[kind]} title={KIND_LABEL[kind]}>
      {isGoalKind(kind) && (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="7" />
          <path d="M8 5 L11 7.2 L9.8 10.8 L6.2 10.8 L5 7.2 Z" />
        </svg>
      )}
      {kind === "substitution" && (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 5 H13 M10 2 L13 5 L10 8" />
          <path d="M13 11 H3 M6 8 L3 11 L6 14" />
        </svg>
      )}
    </span>
  );
}

function EventRow({ event, running, teamName }: { event: MatchEvent; running: Score | undefined; teamName: string }) {
  const kind = eventKind(event.type);
  const off = kind === "substitution" ? playerOff(event) : null;
  const goal = isGoalKind(kind);
  return (
    <li className={`mc-event mc-event--${event.side === "away" ? "away" : "home"}`}>
      <span className="mc-event__minute">{event.displayMinute}</span>
      <EventIcon kind={kind} />
      {teamName && <span className="mc-visually-hidden">{teamName}: </span>}
      {kind === "other" && <span className="mc-event__type">{event.type}</span>}
      {goal && running && (
        <span className="mc-event__score">
          {running.home} - {running.away}
        </span>
      )}
      <span className="mc-event__player">
        {event.player ?? (goal ? "Unknown scorer" : "")}
        {kind === "penalty" && " (pen)"}
        {kind === "own-goal" && " (OG)"}
      </span>
      {goal && event.assist && <span className="mc-event__secondary">({event.assist})</span>}
      {off && <span className="mc-event__secondary">{off}</span>}
      {kind === "other" && event.detail && <span className="mc-event__secondary">{event.detail}</span>}
    </li>
  );
}

function Half({ title, half, running, match }: { title: string; half: SummaryHalf; running: Map<MatchEvent, Score>; match: MatchSummary }) {
  const teamName = (e: MatchEvent) => (e.side === "home" ? match.homeTeam.name : e.side === "away" ? match.awayTeam.name : "");
  return (
    <div className="mc-half">
      <h3 className="mc-band">
        {title}
        {half.score && (
          <span className="mc-half__score">
            {half.score.home} - {half.score.away}
          </span>
        )}
      </h3>
      <ul className="mc-events">
        {half.events.map((e, i) => (
          <EventRow key={i} event={e} running={running.get(e)} teamName={teamName(e)} />
        ))}
      </ul>
    </div>
  );
}

export default function SummaryTimeline({ items, match }: { items: MatchEvent[]; match: MatchSummary }) {
  const { first, second, running } = buildSummary(items, match);
  if (first.events.length === 0 && (second?.events.length ?? 0) === 0) {
    return (
      <p className="mc-status" role="status">
        No events yet.
      </p>
    );
  }
  return (
    <>
      <Half title="First half" half={first} running={running} match={match} />
      {second && <Half title="Second half" half={second} running={running} match={match} />}
    </>
  );
}
