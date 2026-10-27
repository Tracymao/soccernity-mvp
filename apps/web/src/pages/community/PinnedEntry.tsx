// The pinned contest entry on a finalist's profile (build register B-092 / B-123 front-end leg;
// Decision Log #404 items 9 and 15, #405 item 1, #406 item 5). Figma: before the reveal 6707:26727
// (desktop) / 6709:26922 (mobile), after the reveal 6707:26938 / 6709:27056.
//
// Data: `GET /contest/users/:userId/pinned-entry` says which post is pinned (null when nothing is, when
// the pin has been removed at 00:00 on the 1st, or when the viewer may not see it: a final entry is
// invisible to everyone but its author until the reveal, and a Block hides it in both directions).
// The post itself is `GET /posts/:id`, rendered by the ordinary PostCard.
//
// LOCKED ENGAGEMENT: from the upload to the reveal (00:00 on day 25) all engagement on a final entry
// is locked, even for the author. While the current contest is still in its upload window
// (`calendarState.kind === "final_upload"`) the card is drawn with disabled controls, no counts and
// the note from the frame; from the reveal it is an ordinary card, unlocked. The server enforces the
// lock either way (403 `contest_final_locked`), so this only stops offering what it would refuse. If
// the contest cannot be read, the author's own entry is drawn locked (the safe default); someone else
// can only be looking at it after the reveal, when it is unlocked.
//
// Only a FINAL entry is lockable. A weekly entry that is still pinned is an ordinary card.
import { useEffect, useState } from "react";
import { getCurrentContest, getPinnedEntry, type PinnedContestEntry } from "../../api/contest";
import { getPostById, type FeedPost } from "../../api/feed";
import PostCard from "./PostCard";
import "./CommunityPage.css";
import "./PinnedEntry.css";

interface Props {
  accessToken: string;
  /** The profile owner. */
  userId: string;
  /** The signed-in viewer. */
  currentUserId: string;
}

interface Loaded {
  entry: PinnedContestEntry;
  post: FeedPost;
  locked: boolean;
}

export default function PinnedEntry({ accessToken, userId, currentUserId }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    (async () => {
      try {
        const { entry } = await getPinnedEntry(accessToken, userId);
        if (!entry) return;
        const post = await getPostById(accessToken, entry.postId);
        let locked = false;
        if (entry.kind === "final") {
          try {
            const current = await getCurrentContest(accessToken);
            locked = current.calendarState?.kind === "final_upload";
          } catch {
            locked = userId === currentUserId;
          }
        }
        if (!cancelled) setLoaded({ entry, post, locked });
      } catch {
        // Nothing pinned, hidden from this viewer, or a load failure: show nothing. The profile page
        // never breaks for this module.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, userId, currentUserId]);

  if (!loaded) return null;

  return (
    <section className="pinned-entry" aria-label="Pinned contest entry" data-testid="pinned-entry">
      <p className="pinned-entry__label">Pinned</p>
      <PostCard
        post={loaded.post}
        accessToken={accessToken}
        currentUserId={currentUserId}
        engagementLocked={loaded.locked}
        playVideo
      />
    </section>
  );
}
