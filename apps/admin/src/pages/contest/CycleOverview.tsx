// The cycle overview block shared by the Contest Console hub (live,
// phase-contextual primary action) and the read-only past-cycle detail
// page. Figma: the "Cycle Card" + "Table — Weekly Rounds" + "Panels"
// group on frames 6266:14767 / 6269:* / 6270:*.
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import type {
  AdminContestCycleDetail,
  AdminContestRoundDetail,
  ContestCycleSummary,
  ContestPhase,
  ContestStandingSummary,
  ContestWinnerSummary,
} from "../../api/contest";
import {
  PHASE_LABEL,
  PhaseStrip,
  StatusPill,
  formatDate,
  formatDateTime,
  ordinal,
} from "./contestShared";

interface CycleOverviewData {
  cycle: ContestCycleSummary;
  phase: ContestPhase;
  rounds: AdminContestRoundDetail[];
  weeklyWinners: ContestWinnerSummary[];
  monthlyStandings: ContestStandingSummary[];
}

function judgedCount(rounds: { status: string }[]): number {
  return rounds.filter((r) => r.status === "judged").length;
}

function PrimaryAction({ data }: { data: CycleOverviewData }) {
  const navigate = useNavigate();
  const { cycle, phase, rounds } = data;
  const nextWeek = Math.min(judgedCount(rounds) + 1, 3);

  let label: string;
  let hint: string;
  let go: () => void;

  switch (phase) {
    case "vacant":
    case "week_1":
    case "weeks_1_2":
      label = `Judge week ${nextWeek}`;
      hint = `Weeks are judged in order — week ${nextWeek} is next.`;
      go = () => navigate(`/contest/cycles/${cycle.id}/rounds/${nextWeek}`);
      break;
    case "weeks_1_3":
      label = "Open the final";
      hint = "All three weekly rounds are judged.";
      go = () => navigate(`/contest/cycles/${cycle.id}/final/open`);
      break;
    case "final_live":
      label = "Crown winners";
      hint = "The final is open — set the monthly top 3.";
      go = () => navigate(`/contest/cycles/${cycle.id}/crown`);
      break;
    case "crowned":
      label = "Start a new cycle";
      hint = "This cycle is crowned and closed.";
      go = () => navigate("/contest/cycles/new");
      break;
    default:
      return null;
  }

  return (
    <div className="ct-action-row">
      <button type="button" className="ct-btn ct-btn--primary" onClick={go}>
        {label}
      </button>
      <span className="ct-action-hint">{hint}</span>
    </div>
  );
}

function RoundRow({
  round,
  cycleId,
  nextWeek,
  readOnly,
}: {
  round: AdminContestRoundDetail;
  cycleId: string;
  nextWeek: number;
  readOnly: boolean;
}) {
  const isJudged = round.status === "judged";
  const isNext = !isJudged && round.weekNumber === nextWeek;

  let action: ReactNode;
  if (isJudged) {
    action = (
      <Link className="ct-link" to={`/contest/cycles/${cycleId}/rounds/${round.weekNumber}`}>
        View results
      </Link>
    );
  } else if (isNext && !readOnly) {
    action = (
      <Link className="ct-link" to={`/contest/cycles/${cycleId}/rounds/${round.weekNumber}`}>
        Judge week {round.weekNumber}
      </Link>
    );
  } else {
    action = (
      <span className="ct-link ct-link--muted">
        Judge week {round.weekNumber - 1} first
      </span>
    );
  }

  return (
    <div className="ct-table__row">
      <span className="ct-cell--primary">{round.weekNumber}</span>
      <span className="ct-cell--primary">
        {formatDate(round.opensAt)} — {formatDate(round.closesAt)}
      </span>
      <span>
        <StatusPill value={round.status} />
      </span>
      <span className="ct-cell--primary">{round.entryCount}</span>
      <span className="ct-cell--secondary">{formatDateTime(round.judgedAt)}</span>
      <span>{action}</span>
    </div>
  );
}

export default function CycleOverview({
  data,
  readOnly = false,
}: {
  data: AdminContestCycleDetail | CycleOverviewData;
  readOnly?: boolean;
}) {
  const { cycle, phase, rounds, weeklyWinners, monthlyStandings } = data;
  const nextWeek = Math.min(judgedCount(rounds) + 1, 3);

  return (
    <>
      <div className="ct-card">
        <div className="ct-card__head">
          <h2 className="ct-card__title">{cycle.title}</h2>
          <StatusPill value={cycle.status} />
          <span className="ct-pill ct-pill--soft">{PHASE_LABEL[phase]}</span>
        </div>
        <div className="ct-meta">
          <span>
            {formatDate(cycle.startsAt)} → {formatDate(cycle.endsAt)}
          </span>
          <span>Cycle ID {cycle.id}</span>
          {cycle.finalOpenedAt ? <span>Final opened {formatDateTime(cycle.finalOpenedAt)}</span> : null}
          {cycle.crownedAt ? <span>Crowned {formatDateTime(cycle.crownedAt)}</span> : null}
        </div>
        <div className="ct-divider" />
        <PhaseStrip phase={phase} />
        <p className="ct-note">
          phase = &quot;{phase}&quot; · derived by ContestService.derivePhase(), never stored
        </p>
        {!readOnly ? <PrimaryAction data={{ ...data, phase }} /> : null}
      </div>

      <div className="ct-table ct-rounds">
        <div className="ct-table__row ct-table__row--head">
          <span>Week</span>
          <span>Window</span>
          <span>Status</span>
          <span>Entries</span>
          <span>Judged</span>
          <span aria-hidden />
        </div>
        {rounds.map((r) => (
          <RoundRow
            key={r.weekNumber}
            round={r}
            cycleId={cycle.id}
            nextWeek={nextWeek}
            readOnly={readOnly}
          />
        ))}
      </div>

      <div className="ct-panels">
        <div className="ct-panel">
          <div className="ct-panel__head">
            <span className="ct-panel__title">Weekly winners</span>
            <span className="ct-panel__sub">weeklyWinners[] — fills as each round is judged</span>
          </div>
          {weeklyWinners.length === 0 ? (
            <div className="ct-panel__empty">
              <strong>No weeks judged yet</strong>
              <span>Weekly winners appear here as each round is judged, in order.</span>
            </div>
          ) : (
            weeklyWinners.map((w) => (
              <div className="ct-panel__row" key={`${w.weekNumber}-${w.position}-${w.userId}`}>
                <span className="ct-pill ct-pill--soft">
                  Week {w.weekNumber} · {ordinal(w.position)}
                </span>
                <span>{w.displayName}</span>
              </div>
            ))
          )}
        </div>

        <div className="ct-panel">
          <div className="ct-panel__head">
            <span className="ct-panel__title">Monthly standings</span>
            <span className="ct-panel__sub">monthlyStandings[] — set by the crown step</span>
          </div>
          {monthlyStandings.length === 0 ? (
            <div className="ct-panel__empty">
              <strong>Nothing crowned yet</strong>
              <span>
                The monthly top 3 is set when the cycle is crowned, after the final opens.
                Finalists are drawn from this cycle’s weekly winners.
              </span>
            </div>
          ) : (
            monthlyStandings.map((s) => (
              <div className="ct-panel__row" key={`${s.position}-${s.userId}`}>
                <span className="ct-pill ct-pill--soft">{ordinal(s.position)}</span>
                <span>{s.displayName}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
