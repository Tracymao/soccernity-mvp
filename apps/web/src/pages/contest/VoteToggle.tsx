// The ONE vote control (Decision Log #401 E9, #403 item 7; Figma component set 6670:28355): a single
// button with two states, "Vote" and "Voted". Click to vote, click again to un-vote; there is no
// separate "Change vote" control (changing a vote is un-voting, then voting for someone else). The
// count beside it updates live by one in either direction and no banner appears (#404 item 5).
//
// State is signalled by the label AND `aria-pressed`, never colour alone.
import { pluralVotes } from "./contestTime";
import "./VoteToggle.css";

interface Props {
  voted: boolean;
  voteCount: number;
  busy?: boolean;
  onToggle: () => void;
  /** Used in the accessible name: "Vote for Chuks". */
  entrantName: string;
}

export default function VoteToggle({ voted, voteCount, busy, onToggle, entrantName }: Props) {
  return (
    <div className="vote-toggle">
      <button
        type="button"
        className={voted ? "vote-toggle__button vote-toggle__button--on" : "vote-toggle__button"}
        onClick={onToggle}
        disabled={busy}
        aria-pressed={voted}
        aria-label={`${voted ? "Remove your vote for" : "Vote for"} ${entrantName}`}
      >
        {voted ? "Voted" : "Vote"}
      </button>
      <span className="vote-toggle__count" aria-live="polite">
        {pluralVotes(voteCount)}
      </span>
    </div>
  );
}
