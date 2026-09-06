// Judge Week — GET /admin/contest/cycles/:id (find the round) +
// POST /admin/contest/cycles/:id/rounds/:week/results. Figma frames
// 6274:15676 (open round), 6275:15777 (already judged, read-only),
// 6275:15985 (thin week — 0 entries, still closes), 6275:16182 (blocked,
// out of sequence). Which one renders is driven entirely by the round's
// real state, not a query param.
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { AdminApiError } from "../../api/adminClient";
import {
  getContestCycle,
  judgeContestRound,
  type AdminContestEntry,
  type AdminContestRoundDetail,
} from "../../api/contest";
import {
  PositionChips,
  StatusPill,
  formatDate,
  formatDateTime,
  ordinal,
  useAsyncData,
  type PositionValue,
} from "./contestShared";
import "./contest.css";

function EntryMedia({ entry }: { entry: AdminContestEntry }) {
  if (entry.post.mediaUrls.length > 0) {
    return (
      <div className="ct-entry__thumb">
        Video clip
        <small>mediaUrls[0]</small>
      </div>
    );
  }
  return (
    <div className="ct-entry__thumb ct-entry__thumb--none">
      No media
      <small>mediaUrls: []</small>
    </div>
  );
}

function EntryBody({ entry }: { entry: AdminContestEntry }) {
  return (
    <div className="ct-entry__body">
      <div className="ct-entrant">
        <span className="ct-entrant__name">{entry.entrant.displayName}</span>
        <span className="ct-entrant__time">Submitted {formatDateTime(entry.submittedAt)}</span>
      </div>
      <p className="ct-entry__text">{entry.post.contentText}</p>
      <div className="ct-entry__post-meta">
        <span>
          {entry.post.likeCount} {entry.post.likeCount === 1 ? "like" : "likes"}
        </span>
        <span>
          {entry.post.commentCount} {entry.post.commentCount === 1 ? "comment" : "comments"}
        </span>
      </div>
    </div>
  );
}

function RoundContext({ cycleTitle, round }: { cycleTitle: string; round: AdminContestRoundDetail }) {
  return (
    <div className="ct-card">
      <div className="ct-card__head">
        <h2 className="ct-card__title">
          {cycleTitle} · Week {round.weekNumber}
        </h2>
        <StatusPill value={round.status} />
      </div>
      <div className="ct-meta">
        <span>
          {formatDate(round.opensAt)} — {formatDate(round.closesAt)}
        </span>
        <span>
          {round.entryCount} {round.entryCount === 1 ? "entry" : "entries"}
        </span>
        {round.judgedAt ? <span>Judged {formatDateTime(round.judgedAt)}</span> : null}
      </div>
    </div>
  );
}

export default function ContestJudgeWeekPage() {
  const navigate = useNavigate();
  const { id = "", week = "" } = useParams();
  const weekNumber = Number(week);
  const { data, loading, errorStatus, error } = useAsyncData(() => getContestCycle(id), [id]);

  const round = data?.rounds.find((r) => r.weekNumber === weekNumber) ?? null;
  const earlierUnjudged = data?.rounds
    .filter((r) => r.weekNumber < weekNumber && r.status !== "judged")
    .sort((a, b) => a.weekNumber - b.weekNumber)[0];

  const [positions, setPositions] = useState<Record<string, PositionValue>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const winners = useMemo(() => {
    if (!round) return [];
    return round.entries
      .map((e) => ({ entryId: e.entryId, position: positions[e.entryId] ?? null }))
      .filter((w): w is { entryId: string; position: 1 | 2 | 3 } => w.position != null);
  }, [round, positions]);

  const submit = async (payload: { entryId: string; position: 1 | 2 | 3 }[]) => {
    setSubmitError(null);
    setSaving(true);
    try {
      await judgeContestRound(id, weekNumber, payload);
      navigate("/contest");
    } catch (err) {
      setSaving(false);
      setSubmitError(
        err instanceof AdminApiError ? err.message : "Couldn’t save the results. Please try again.",
      );
    }
  };

  const backLink = (
    <div className="ct-back">
      <Link to="/contest">← Contest Console</Link>
    </div>
  );

  if (loading) {
    return (
      <>
        <AdminPageHeader title={`Judge Week ${weekNumber || ""}`} hideSearch />
        <div className="ct-page">
          {backLink}
          <p className="ct-loading">Loading the round…</p>
        </div>
      </>
    );
  }

  if (errorStatus === 404 || !data || !round) {
    return (
      <>
        <AdminPageHeader title="Judge Week" hideSearch />
        <div className="ct-page">
          {backLink}
          <div className="ct-card">
            <h2 className="ct-card__title">Round not found</h2>
            <p className="ct-note">
              {error ?? `This cycle has no week ${weekNumber} round.`}
            </p>
            <div className="ct-action-row">
              <Link className="ct-btn ct-btn--primary" to="/contest">
                Back to Contest Console
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  const isJudged = round.status === "judged";
  const isBlocked = !isJudged && earlierUnjudged != null;
  const isThinWeek = !isJudged && !isBlocked && round.entries.length === 0;

  return (
    <>
      <AdminPageHeader title={`Judge Week ${weekNumber}`} hideSearch />
      <div className="ct-page">
        {backLink}
        <div className="ct-top-row">
          <h1 className="ct-title">
            {isJudged ? `Week ${weekNumber} Results` : `Judge Week ${weekNumber}`}
          </h1>
        </div>

        {isBlocked ? (
          <div className="ct-callout ct-callout--alert" role="alert">
            <span className="ct-callout__bar" aria-hidden />
            <p>
              Week {earlierUnjudged?.weekNumber} must be judged before week {weekNumber}. Weekly
              rounds close in order.
            </p>
          </div>
        ) : null}

        <RoundContext cycleTitle={data.cycle.title} round={round} />

        {submitError ? (
          <p className="ct-error" role="alert">
            {submitError}
          </p>
        ) : null}

        {isThinWeek ? (
          <div className="ct-card">
            <h2 className="ct-card__title">No entries this week</h2>
            <p className="ct-note">
              Nobody submitted an entry to week {weekNumber}. You can still close the round — it will
              have no weekly winners.
            </p>
            <div className="ct-action-row">
              <button
                type="button"
                className="ct-btn ct-btn--primary"
                onClick={() => submit([])}
                disabled={saving}
              >
                {saving ? "Closing…" : `Close week ${weekNumber} with no winners`}
              </button>
              <Link className="ct-btn ct-btn--outline" to="/contest">
                Cancel
              </Link>
            </div>
          </div>
        ) : null}

        {round.entries.length > 0 ? (
          <div className="ct-finalists">
            {round.entries.map((entry) => (
              <div
                key={entry.entryId}
                className={"ct-entry" + (isJudged || isBlocked ? " ct-entry--dim" : "")}
              >
                <EntryMedia entry={entry} />
                <EntryBody entry={entry} />
                <div className="ct-entry__selector">
                  <span className="ct-selector-label">Position</span>
                  {isJudged || isBlocked ? (
                    <span className="ct-static-pos">
                      {entry.position ? ordinal(entry.position) : "No placing"}
                    </span>
                  ) : (
                    <PositionChips
                      ariaLabel={`Position for ${entry.entrant.displayName}`}
                      value={positions[entry.entryId] ?? null}
                      onChange={(v) =>
                        setPositions((prev) => ({ ...prev, [entry.entryId]: v }))
                      }
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {!isJudged && !isBlocked && round.entries.length > 0 ? (
          <div className="ct-actions-card">
            <button
              type="button"
              className="ct-btn ct-btn--primary"
              onClick={() => submit(winners)}
              disabled={saving}
            >
              {saving ? "Saving…" : `Save week ${weekNumber} results`}
            </button>
            <Link className="ct-btn ct-btn--outline" to="/contest">
              Cancel
            </Link>
            <span className="ct-actions-card__hint">
              Ties are allowed — two entries may share a position. Leaving every entry on “None”
              closes the round with no winners. Saving closes week {weekNumber} and awards
              weekly-win points; it cannot be undone.
            </span>
          </div>
        ) : null}
      </div>
    </>
  );
}
