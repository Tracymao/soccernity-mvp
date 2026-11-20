// "Add topics" for the room creator (B-071; Figma M11 to M18 on mobile as a
// bottom sheet, D9 to D16 on desktop as a popover under the "Add topic" chip).
//
// Names come from two places and are sent together, 1 to 5 per submit:
//   - one typed free-text name (2 to 60 characters, trimmed), and
//   - existing topics picked from the catalogue (GET /banter-rooms/topics,
//     20 a page, "Show more topics" asks for the next page).
// POST /banter-rooms/:id/topics find-or-creates each name (case-insensitive)
// and answers with the room's full topic list, which the parent keeps.
//
// States: catalogue loading (skeleton chips), catalogue failed (banner, "Try
// again", typing still works), name too short or too long (inline rule, Add
// disabled), saving ("Adding...", fields dimmed), save failed (banner, the
// button becomes "Try again").
import { useCallback, useEffect, useId, useState } from "react";
import {
  attachTopics,
  BanterApiError,
  listTopics,
  type BanterTopic,
} from "../../api/banter";
import BanterModal, { type BanterModalVariant } from "./BanterModal";

export const TOPIC_NAME_MIN = 2;
export const TOPIC_NAME_MAX = 60;
export const TOPICS_PER_REQUEST = 5;

const RULE = `Use ${TOPIC_NAME_MIN} to ${TOPIC_NAME_MAX} characters.`;
const SAVE_ERROR = "Couldn’t add the topic. Check your connection and try again.";
const LOAD_ERROR = "Couldn’t load existing topics. You can still type one.";

interface AddTopicsSheetProps {
  accessToken: string;
  roomId: string;
  variant: BanterModalVariant;
  attached: BanterTopic[];
  onClose: () => void;
  onAdded: (topics: BanterTopic[]) => void;
}

export default function AddTopicsSheet({ accessToken, roomId, variant, attached, onClose, onAdded }: AddTopicsSheetProps) {
  const titleId = useId();
  const inputId = useId();
  const [typed, setTyped] = useState("");
  const [picked, setPicked] = useState<BanterTopic[]>([]);
  const [catalogue, setCatalogue] = useState<BanterTopic[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [catalogueState, setCatalogueState] = useState<"loading" | "loaded" | "error">("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldRuleFromServer, setFieldRuleFromServer] = useState(false);

  const loadFirstPage = useCallback(async () => {
    setCatalogueState("loading");
    try {
      const page = await listTopics(accessToken);
      setCatalogue(page.items);
      setCursor(page.nextCursor);
      setCatalogueState("loaded");
    } catch {
      setCatalogueState("error");
    }
  }, [accessToken]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  async function showMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listTopics(accessToken, cursor);
      setCatalogue((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      setCatalogueState("error");
    } finally {
      setLoadingMore(false);
    }
  }

  const typedName = typed.trim();
  const typedInvalid = typedName.length > 0 && (typedName.length < TOPIC_NAME_MIN || typedName.length > TOPIC_NAME_MAX);
  const showRule = typedInvalid || fieldRuleFromServer;

  // Names sent: the typed one (when valid), then the picked ones. A picked name
  // equal to the typed one (case-insensitive) counts once.
  const names: string[] = [];
  const seen = new Set<string>();
  function push(name: string) {
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    names.push(name);
  }
  if (typedName && !typedInvalid) push(typedName);
  for (const t of picked) push(t.name);

  const count = names.length;
  const tooMany = count > TOPICS_PER_REQUEST;
  const canSubmit = count >= 1 && !tooMany && !typedInvalid && !saving;

  const attachedIds = new Set(attached.map((t) => t.id));
  const pickable = catalogue.filter((t) => !attachedIds.has(t.id));
  const pickedIds = new Set(picked.map((t) => t.id));

  function toggle(topic: BanterTopic) {
    if (saving) return;
    setPicked((prev) => (prev.some((p) => p.id === topic.id) ? prev.filter((p) => p.id !== topic.id) : [...prev, topic]));
  }

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setSaveError(null);
    setFieldRuleFromServer(false);
    try {
      const result = await attachTopics(accessToken, roomId, names);
      onAdded(result.topics);
    } catch (err) {
      if (err instanceof BanterApiError && err.status === 400) {
        // A name the server did not accept: same rule as the inline one.
        setFieldRuleFromServer(true);
      } else if (err instanceof BanterApiError && err.status !== undefined && err.status >= 400 && err.status < 500) {
        setSaveError(err.message);
      } else {
        setSaveError(SAVE_ERROR);
      }
    } finally {
      setSaving(false);
    }
  }

  const submitLabel = saving
    ? "Adding…"
    : saveError
      ? "Try again"
      : count === 0
        ? "Add topic"
        : `Add ${count} ${count === 1 ? "topic" : "topics"}`;

  return (
    <BanterModal titleId={titleId} variant={variant} busy={saving} onClose={onClose}>
      {variant === "sheet" && <span className="banter-modal__grab" aria-hidden="true" />}
      <h2 id={titleId} className="banter-modal__title">
        Add topics
      </h2>
      <p className="banter-modal__body">
        Topics help people find this room. Add up to {TOPICS_PER_REQUEST} at a time, {TOPIC_NAME_MIN} to {TOPIC_NAME_MAX}{" "}
        characters each.
      </p>

      <div className={`banter-topics-form${saving ? " banter-topics-form--saving" : ""}`}>
        <label className="banter-modal__label" htmlFor={inputId}>
          Topic
        </label>
        <input
          id={inputId}
          className={`banter-modal__input${showRule ? " banter-modal__input--invalid" : ""}`}
          type="text"
          value={typed}
          placeholder="Type a topic, for example Transfer window"
          aria-invalid={showRule || undefined}
          aria-describedby={showRule ? `${inputId}-rule` : undefined}
          disabled={saving}
          data-autofocus
          onChange={(e) => {
            setTyped(e.target.value);
            setFieldRuleFromServer(false);
          }}
        />
        {showRule && (
          <p id={`${inputId}-rule`} className="banter-modal__hint">
            {RULE}
          </p>
        )}

        <p className="banter-modal__label">Or pick an existing topic</p>
        {catalogueState === "loading" && (
          <div className="banter-topics-skeleton" role="status" aria-label="Loading topics">
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className="banter-topics-skeleton__chip" aria-hidden="true" />
            ))}
          </div>
        )}
        {catalogueState === "error" && (
          <>
            <p className="banter-modal__error" role="alert">
              {LOAD_ERROR}
            </p>
            <button type="button" className="banter-modal__link" onClick={() => void loadFirstPage()}>
              Try again
            </button>
          </>
        )}
        {catalogueState === "loaded" && (
          <>
            {pickable.length === 0 ? (
              <p className="banter-modal__body">No other topics to pick from yet.</p>
            ) : (
              <ul className="banter-topics-pick" aria-label="Existing topics">
                {pickable.map((topic) => {
                  const on = pickedIds.has(topic.id);
                  // At the limit, only already-picked chips stay clickable.
                  const blocked = !on && count >= TOPICS_PER_REQUEST;
                  return (
                    <li key={topic.id}>
                      <button
                        type="button"
                        className={`banter-topics-pick__chip${on ? " banter-topics-pick__chip--on" : ""}`}
                        aria-pressed={on}
                        disabled={saving || blocked}
                        onClick={() => toggle(topic)}
                      >
                        {on && <span aria-hidden="true">&#10003; </span>}
                        {topic.name}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {cursor && (
              <button type="button" className="banter-modal__link" onClick={() => void showMore()} disabled={loadingMore || saving}>
                {loadingMore ? "Loading…" : "Show more topics"}
              </button>
            )}
          </>
        )}
      </div>

      {tooMany && <p className="banter-modal__hint">Add up to {TOPICS_PER_REQUEST} at a time.</p>}
      {saveError && (
        <p className="banter-modal__error" role="alert">
          {saveError}
        </p>
      )}

      <div className="banter-modal__actions banter-modal__actions--stack banter-modal__actions--sheet">
        <button type="button" className="banter-modal__primary" onClick={() => void submit()} disabled={!canSubmit}>
          {submitLabel}
        </button>
        <button type="button" className="banter-modal__secondary" onClick={onClose} disabled={saving}>
          Cancel
        </button>
      </div>
    </BanterModal>
  );
}
