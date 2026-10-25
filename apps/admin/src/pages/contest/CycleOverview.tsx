// The read-only overview of a contest month, shared by the Contest page (the running or latest month) and
// the past-cycle detail page. Figma: "Overview -- Running" 6644:22559, "Overview -- Final (No winner this
// month)" 6644:22852 (pass C, B-095).
//
// READ-ONLY STATUS. Winners are decided by engagement and community votes, so there is no Judge, Open the
// Final or Crown control anywhere (the admin-judged model is gone, Decision Log #381). "Forfeited" and "No
// winner this month" are shown as status, never as an action.
//
// Admin-only figures shown here (never in any user-facing screen): the minimum tally, the placement-point
// settings, each entry's Phase 1 tally and rank, and the final points. Impression figures are not shown:
// the exposure engine does not exist yet (B-092), see ContestImpressionsPage.
import { useState } from "react";
import type { AdminContestCycleDetail, AdminCurrentContest, AdminContestRoundDetail } from "../../api/contest";
import {
  StatusPill,
  calendarLabel,
  formatDateTime,
  monthLabel,
  ordinal,
  roundStatusLabel,
} from "./contestShared";

type Overview = AdminContestCycleDetail | (AdminCurrentContest & { cycle: NonNullable<AdminCurrentContest["cycle"]> });

function points(values: [number, number, number]): string {
  return values.map((v) => v.toLocaleString("en-GB")).join(" / ");
}

function RoundEntries({ round }: { round: AdminContestRoundDetail }) {
  const [open, setOpen] = useState(false);
  if (round.entries.length === 0) return <span className="ct-cell--secondary">—</span>;
  return (
    <>
      <button type="button" className="ct-link ct-link--button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? "Hide" : "Show"} {round.entries.length}
      </button>
      {open && (
        <div className="ct-entries" data-testid={`ct-entries-${round.weekNumber}`}>
          {round.entries.map((e) => (
            <div className="ct-entry-row" key={e.entryId}>
              <span className="ct-cell--primary">{e.entrant.publicName}</span>
              <span>{e.qualified ? "Qualified" : "Not qualified"}</span>
              <span>{e.phase1Rank ? `Phase 1 rank ${e.phase1Rank}` : "No rank yet"}</span>
              <span>{e.phase1Tally !== null ? `Tally ${e.phase1Tally}` : ""}</span>
              <span>{`${e.voteCount} ${e.voteCount === 1 ? "vote" : "votes"}`}</span>
              {e.finalRank ? <span>{`Final rank ${e.finalRank} · ${e.finalTally ?? 0} pts`}</span> : null}
              {e.position ? <span className="ct-pill ct-pill--soft">{ordinal(e.position)}</span> : null}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default function CycleOverview({ data }: { data: Overview }) {
  const { cycle, settings, calendarState, rounds, weeklyWinners, monthlyStandings, finalOutcome, finalists } = data;
  const header = cycle.monthKey ? `${monthLabel(cycle.monthKey)} Contest` : cycle.title;

  return (
    <>
      <div className="ct-card">
        <div className="ct-card__head">
          <h2 className="ct-card__title">{cycle.title}</h2>
          <StatusPill value={cycle.status} />
          {calendarLabel(calendarState) ? (
            <span className="ct-pill ct-pill--soft">{calendarLabel(calendarState)}</span>
          ) : null}
        </div>
        <div className="ct-meta">
          {cycle.monthKey ? <span>{header}</span> : null}
          {cycle.finalOpenedAt ? <span>Final revealed {formatDateTime(cycle.finalOpenedAt)}</span> : null}
          {cycle.crownedAt ? <span>Completed {formatDateTime(cycle.crownedAt)}</span> : null}
        </div>
        {cycle.description ? <p className="ct-note">{cycle.description}</p> : null}
        {settings ? (
          <>
            <div className="ct-divider" />
            <div className="ct-settings">
              <div>
                <span className="ct-settings__label">Minimum tally</span>
                <strong>{settings.minimumTally !== null ? `${settings.minimumTally} points` : "—"}</strong>
              </div>
              <div>
                <span className="ct-settings__label">Weekly placement points</span>
                <strong>{points(settings.weeklyPoints)}</strong>
              </div>
              <div>
                <span className="ct-settings__label">Monthly final placement points</span>
                <strong>{points(settings.monthlyPoints)}</strong>
              </div>
              <div>
                <span className="ct-settings__label">Followers excluded (week 4)</span>
                <strong>{settings.followersExcludedWeek4 ? "On" : "Off"}</strong>
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div className="ct-table ct-rounds">
        <div className="ct-table__row ct-table__row--head">
          <span>Week</span>
          <span>Dates (Europe/London)</span>
          <span>Phase 1 · entries</span>
          <span>Phase 2 · votes lock</span>
          <span>Entries</span>
          <span>Status</span>
        </div>
        {rounds.map((r) => (
          <div className="ct-table__row" key={r.weekNumber}>
            <span className="ct-cell--primary">{r.weekNumber}</span>
            <span className="ct-cell--primary">
              {formatDateTime(r.opensAt)} → {formatDateTime(r.closesAt)}
            </span>
            <span className="ct-cell--secondary">
              {r.weekNumber === 4 ? "Uploads, then reveal" : `Until ${formatDateTime(r.entriesCloseAt)}`}
            </span>
            <span className="ct-cell--secondary">
              {r.weekNumber === 4 ? "No vote: likes and comments rank" : formatDateTime(r.votesLockAt)}
            </span>
            <span className="ct-cell--primary">
              {r.entryCount} <RoundEntries round={r as AdminContestRoundDetail} />
            </span>
            <span>
              <StatusPill value={roundStatusLabel(r, calendarState)} />
              {r.forfeited && r.forfeitReason ? <span className="ct-cell--secondary"> {r.forfeitReason}</span> : null}
            </span>
          </div>
        ))}
      </div>

      <div className="ct-panels">
        <div className="ct-panel">
          <div className="ct-panel__head">
            <span className="ct-panel__title">Weekly winners</span>
            <span className="ct-panel__sub">Decided at each week&rsquo;s 20:00 vote lock</span>
          </div>
          {weeklyWinners.length === 0 ? (
            <div className="ct-panel__empty">
              <strong>No weekly winners yet</strong>
              <span>The top 3 of each week appear here once its votes lock.</span>
            </div>
          ) : (
            weeklyWinners.map((w) => (
              <div className="ct-panel__row" key={`${w.weekNumber}-${w.position}-${w.userId}`}>
                <span className="ct-pill ct-pill--soft">
                  Week {w.weekNumber} · {ordinal(w.position)}
                </span>
                <span>{w.publicName}</span>
              </div>
            ))
          )}
        </div>

        <div className="ct-panel">
          <div className="ct-panel__head">
            <span className="ct-panel__title">Week 4 final</span>
            <span className="ct-panel__sub">
              {finalists.length > 0 ? `${finalists.length} finalist${finalists.length === 1 ? "" : "s"}` : "Finalists are set after week 3"}
            </span>
          </div>
          {finalOutcome === "no_winner" ? (
            <div className="ct-panel__empty">
              <strong>No winner this month</strong>
              <span>Nobody reached the minimum tally, so no final placings were awarded.</span>
            </div>
          ) : monthlyStandings.length > 0 ? (
            monthlyStandings.map((s) => (
              <div className="ct-panel__row" key={`${s.position}-${s.userId}`}>
                <span className="ct-pill ct-pill--soft">{ordinal(s.position)}</span>
                <span>{s.publicName}</span>
              </div>
            ))
          ) : finalOutcome === "no_final" ? (
            <div className="ct-panel__empty">
              <strong>No final this month</strong>
              <span>No weekly winner came through, so there was nothing to run.</span>
            </div>
          ) : (
            <div className="ct-panel__empty">
              <strong>Not decided yet</strong>
              <span>The monthly top 3 is set automatically at the end of the month.</span>
            </div>
          )}
        </div>
      </div>

      <div className="ct-callout">
        <span className="ct-callout__bar" aria-hidden />
        <p>Read-only status. Winners are decided by engagement and community votes &mdash; admins do not judge or crown.</p>
      </div>
    </>
  );
}
