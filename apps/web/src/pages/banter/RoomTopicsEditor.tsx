// The room's topic chips for its CREATOR (B-071; Figma M3, M18, M19 and D2,
// D16). Every chip has a remove cross; a dashed "Add topic" chip opens the
// Add topics sheet (mobile) or popover (desktop). A room with no topics reads
// "No topics yet." beside the Add topic chip.
//
// Remove calls DELETE /banter-rooms/:id/topics/:topicId. While it runs the
// chip is dimmed and its cross is disabled; on success the chip goes; on
// failure the chip stays and one line under the chips says so. The frames draw
// the cross (M19) but neither the in-flight nor the failure state, so those two
// are plain defaults (flagged in the PR).
//
// Everyone else sees the plain read-only chips rendered by BanterRoomPage.
import { useState } from "react";
import { removeTopic, type BanterTopic } from "../../api/banter";
import { useIsMobile } from "../../layout/useIsMobile";
import AddTopicsSheet from "./AddTopicsSheet";

const REMOVE_ERROR = "Couldn’t remove the topic. Try again.";

interface RoomTopicsEditorProps {
  accessToken: string;
  roomId: string;
  topics: BanterTopic[];
  /** The room's full new topic list (after Add topics). */
  onTopicsReplaced: (topics: BanterTopic[]) => void;
  /** One topic removed; the parent filters its own latest list so overlapping removals both stick. */
  onTopicRemoved: (topicId: string) => void;
}

export default function RoomTopicsEditor({ accessToken, roomId, topics, onTopicsReplaced, onTopicRemoved }: RoomTopicsEditorProps) {
  const isMobile = useIsMobile();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [removeError, setRemoveError] = useState(false);

  async function remove(topic: BanterTopic) {
    if (removing.has(topic.id)) return;
    setRemoveError(false);
    setRemoving((prev) => new Set(prev).add(topic.id));
    try {
      await removeTopic(accessToken, roomId, topic.id);
      onTopicRemoved(topic.id);
    } catch {
      setRemoveError(true);
    } finally {
      setRemoving((prev) => {
        const next = new Set(prev);
        next.delete(topic.id);
        return next;
      });
    }
  }

  return (
    <div className="banter-room-topics-editor">
      <div className="banter-room-topics-editor__row">
        {topics.length === 0 && <span className="banter-room-topics-editor__none">No topics yet.</span>}
        {topics.length > 0 && (
          <ul className="banter-room-page__topics" aria-label="Topics">
            {topics.map((topic) => {
              const busy = removing.has(topic.id);
              return (
                <li
                  key={topic.id}
                  className={`banter-room-page__topic banter-room-page__topic--editable${busy ? " banter-room-page__topic--removing" : ""}`}
                >
                  <span>{topic.name}</span>
                  <button
                    type="button"
                    className="banter-room-page__topic-remove"
                    aria-label={`Remove ${topic.name}`}
                    disabled={busy}
                    onClick={() => void remove(topic)}
                  >
                    <span aria-hidden="true">&times;</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="banter-room-topics-editor__add">
          <button
            type="button"
            className="banter-room-topic-add"
            data-banter-popover-opener
            aria-haspopup="dialog"
            aria-expanded={adding}
            onClick={() => setAdding((open) => !open)}
          >
            <span aria-hidden="true">+</span> Add topic
          </button>
          {adding && !isMobile && (
            <AddTopicsSheet
              accessToken={accessToken}
              roomId={roomId}
              variant="popover"
              attached={topics}
              onClose={() => setAdding(false)}
              onAdded={(next) => {
                onTopicsReplaced(next);
                setAdding(false);
              }}
            />
          )}
        </div>
      </div>
      {adding && isMobile && (
        <AddTopicsSheet
          accessToken={accessToken}
          roomId={roomId}
          variant="sheet"
          attached={topics}
          onClose={() => setAdding(false)}
          onAdded={(next) => {
            onTopicsReplaced(next);
            setAdding(false);
          }}
        />
      )}
      {removeError && (
        <p className="banter-room-topics-editor__error" role="alert">
          {REMOVE_ERROR}
        </p>
      )}
    </div>
  );
}
