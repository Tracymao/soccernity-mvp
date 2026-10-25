// Contest Voting -- Phase 2 of weeks 1-3: the top 10 entries, one vote each person
// (build register B-098; Decision Log #387, #401 E9, #403 item 7, #404 items 4 and 5).
//
// Figma: Voting 2094:994 (desktop) / 5802:8726 (mobile), which ADOPTED the Already Voted design
// (#403 item 7): an "Entries" column of entry cards each with the vote toggle and a live count, and a
// side board. The separate Already Voted screens (5802:8978 / 5815:8916) are archived, so there is no
// separate page for them: voting, un-voting and voting again all happen here.
//
// Data: GET /contest/current (the calendar state and the round) then GET /contest/rounds/:id/entries
// (the qualified entries, best Phase 1 rank first; Phase 1 tallies are never returned).
//
// THE VOTE: PUT / DELETE /contest/entries/:id/vote through the single toggle. The count updates live
// by one in either direction from the server's own answer, and no banner appears (#404 item 5). A
// person has ONE vote per round: voting for another entry while holding one is a 409
// `contest_already_voted` and the server's own message ("Un-vote first to vote for someone else") is
// shown under that entry; changing a vote is un-voting, then voting for someone else (#401). An
// entrant may vote for themselves; a restricted account cannot vote at all (the server's coded 403
// is shown, no restricted state is drawn).
//
// Not built: the Figma "Your fans right now" cards (no endpoint returns who is watching or voting;
// nothing is faked) and the "Last week on Contest" points board (placement points per winner are not
// returned to users). The side card lists this month's weekly winners so far instead, which is real.
//
// The forfeit pop-ups run here too, as on the Contest details page (#404 item 4).
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import {
  ContestApiError,
  castVote,
  getCurrentContest,
  getRoundEntries,
  retractVote,
  type ContestEntryView,
  type CurrentContestResponse,
} from "../api/contest";
import { isVideoUrl } from "../lib/media";
import { getStoredAccessToken } from "../lib/session";
import ForfeitPopups from "./contest/ForfeitPopups";
import VoteToggle from "./contest/VoteToggle";
import { londonClock, londonLongDate, ordinalPlace } from "./contest/contestTime";
import "./contest/ContestPage.css";
import "./contest/ContestVotingPage.css";

type LoadState = "loading" | "loaded" | "error" | "no-session";

interface EntryState {
  voted: boolean;
  voteCount: number;
  error: string | null;
  busy: boolean;
}

export default function ContestVotingPage() {
  const token = getStoredAccessToken();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [current, setCurrent] = useState<CurrentContestResponse | null>(null);
  const [entries, setEntries] = useState<ContestEntryView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<Record<string, EntryState>>({});
  const [loadingMore, setLoadingMore] = useState(false);

  const seed = useCallback((items: ContestEntryView[]) => {
    setState((prev) => {
      const next = { ...prev };
      for (const entry of items) {
        if (!next[entry.entryId]) {
          next[entry.entryId] = {
            voted: entry.votedByCaller,
            voteCount: entry.voteCount ?? 0,
            error: null,
            busy: false,
          };
        }
      }
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    if (!token) {
      setLoadState("no-session");
      return;
    }
    setLoadState("loading");
    try {
      const data = await getCurrentContest(token);
      setCurrent(data);
      const calendar = data.calendarState;
      if (calendar?.kind === "week_voting") {
        const round = data.rounds.find((r) => r.weekNumber === calendar.weekNumber);
        if (round) {
          const page = await getRoundEntries(token, round.id);
          setEntries(page.items);
          setCursor(page.nextCursor);
          seed(page.items);
        }
      }
      setLoadState("loaded");
    } catch {
      setLoadState("error");
    }
  }, [token, seed]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    if (!token || !current || !cursor) return;
    const calendar = current.calendarState;
    if (calendar?.kind !== "week_voting") return;
    const round = current.rounds.find((r) => r.weekNumber === calendar.weekNumber);
    if (!round) return;
    setLoadingMore(true);
    try {
      const page = await getRoundEntries(token, round.id, cursor);
      setEntries((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
      seed(page.items);
    } catch {
      // Leave the list as it is; the button stays so the person can try again.
    } finally {
      setLoadingMore(false);
    }
  }

  async function toggle(entry: ContestEntryView) {
    if (!token) return;
    const id = entry.entryId;
    const held = state[id]?.voted ?? false;
    setState((s) => ({ ...s, [id]: { ...s[id], busy: true, error: null } }));
    try {
      const result = held ? await retractVote(token, id) : await castVote(token, id);
      setState((s) => ({
        ...s,
        [id]: { voted: result.voted, voteCount: result.voteCount, busy: false, error: null },
      }));
    } catch (err) {
      const message = err instanceof ContestApiError ? err.message : "Couldn't update your vote.";
      setState((s) => ({ ...s, [id]: { ...s[id], busy: false, error: message } }));
    }
  }

  if (loadState === "no-session") {
    return (
      <div className="contest-status" role="status">
        Log in to vote in the contest. <Link to="/login">Log in</Link>
      </div>
    );
  }
  if (loadState === "loading") {
    return (
      <div className="contest-status" role="status">
        Loading the entries…
      </div>
    );
  }
  if (loadState === "error" || !current) {
    return (
      <div className="contest-status contest-status--error" role="alert">
        Couldn&rsquo;t load the entries. Please try again shortly.
      </div>
    );
  }

  const calendar = current.calendarState;
  const voting = calendar?.kind === "week_voting" ? calendar : null;

  return (
    <div className="contest-page voting-page">
      <ForfeitPopups weeks={current.forfeitedWeeks} />

      <Link to="/contest" className="voting-page__back">
        &larr; Back
      </Link>

      {!voting ? (
        <section className="contest-section">
          <h1 className="contest-hero__title">Voting</h1>
          <p className="contest-section__body">
            Voting isn&rsquo;t open right now. Votes open after the entry window closes and lock at 20:00 on days 7, 14
            and 21.
          </p>
          <Link className="contest-cta" to="/contest">
            Back to the Contest
          </Link>
        </section>
      ) : (
        <div className="voting-page__layout">
          <div className="voting-page__main">
            <header>
              <h1 className="contest-hero__title">Entries</h1>
              <p className="contest-section__body">
                Vote for your preferred video entry. You have one vote: click Voted again to remove it, then vote for
                another entry. Voting closes at {londonClock(voting.locksAt)} on {londonLongDate(voting.locksAt)}.
              </p>
            </header>

            {entries.length === 0 ? (
              <p className="contest-section__body" role="status">
                There are no entries to vote on yet.
              </p>
            ) : (
              <ul className="voting-entries">
                {entries.map((entry) => {
                  const s = state[entry.entryId] ?? {
                    voted: entry.votedByCaller,
                    voteCount: entry.voteCount ?? 0,
                    error: null,
                    busy: false,
                  };
                  const video = entry.post.mediaUrls.find(isVideoUrl);
                  const image = !video ? entry.post.mediaUrls[0] : undefined;
                  return (
                    <li key={entry.entryId} className="voting-entry">
                      {video ? (
                        <video className="voting-entry__media" src={video} controls preload="metadata" />
                      ) : image ? (
                        <img className="voting-entry__media" src={image} alt="" />
                      ) : null}
                      <div className="voting-entry__card">
                        <Link to={`/users/${entry.entrant.userId}`} className="voting-entry__name">
                          {entry.entrant.publicName}
                        </Link>
                        {entry.post.contentText && <p className="voting-entry__text">{entry.post.contentText}</p>}
                        <VoteToggle
                          voted={s.voted}
                          voteCount={s.voteCount}
                          busy={s.busy}
                          onToggle={() => void toggle(entry)}
                          entrantName={entry.entrant.publicName}
                        />
                        {s.error && (
                          <p className="voting-entry__error" role="alert">
                            {s.error}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {cursor && (
              <button type="button" className="contest-cta" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            )}
          </div>

          {current.weeklyWinners.length > 0 && (
            <aside className="voting-page__board" aria-label="Weekly winners so far">
              <p className="voting-page__board-title">Winners so far</p>
              <ul className="voting-board">
                {current.weeklyWinners.map((w) => (
                  <li key={w.entryId} className="voting-board__row">
                    <span>{w.publicName}</span>
                    <span>
                      Week {w.weekNumber} · {ordinalPlace(w.position)}
                    </span>
                  </li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
