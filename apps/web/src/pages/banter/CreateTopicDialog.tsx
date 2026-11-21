// "Create a topic" dialog for Bants (build-register B-042 / B-117; Figma pass Y, docs/figma-pass-y-report.md:
// desktop 2355:2137 empty and 2256:8925 filled, mobile 5651:8166 empty and 5651:8207 filled). It replaces the
// inline "Create a room" form that used to sit in BanterPage.
//
// The frames draw: a header with the title and a close (X), an avatar and a Title field, a Scope row (Club,
// League, Country, Topic; a club select when Club is chosen), an optional Description (text only), an emoji icon
// that opens the picker, and a Post button that stays disabled until a title is entered. Nothing else: the
// frames' GIF, poll and attachment controls are hidden in the file, so none is built here.
//
// Behaviour is the shared BanterModal's: a dialog on desktop, a bottom sheet on a phone (useIsMobile), focus
// moves inside (to the Title), Tab is trapped, Escape and the X close it (not while the request is running) and
// focus goes back to the opener.
//
// Description limit: BANTER_ROOM_DESCRIPTION_MAX_LENGTH (api/banter.ts, the API's own limit). It is counted in
// UTF-16 code units (String.length) because the API's class-validator @MaxLength does the same, so an emoji
// that is two units counts as two. The textarea has maxLength for typing, and inserting an emoji is checked
// against the same count (a cell that would not fit is disabled and ignored), so the limit cannot be passed.
// The description is sent trimmed and left out when blank (the API stores a blank one as NULL anyway).
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { WriteRefusalNotice, specificWriteRefusal, type WriteRefusal } from "../community/writeRefusal";
import { BANTER_ROOM_DESCRIPTION_MAX_LENGTH, createRoom, BanterApiError, type BanterRoom, type BanterRoomScopeType } from "../../api/banter";
import { listJoinedClubs, type ClubSummary } from "../../api/clubs";
import { useIsMobile } from "../../layout/useIsMobile";
import BanterModal from "./BanterModal";
import EmojiPicker from "./EmojiPicker";
import { SCOPE_OPTIONS } from "./banterFilters";
import "./CreateTopicDialog.css";

type ClubsState = "loading" | "loaded" | "error";

interface Props {
  accessToken: string;
  /** The signed-in person's public name, for the initials avatar. */
  displayName: string;
  onClose: () => void;
  onCreated: (room: BanterRoom) => void;
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export default function CreateTopicDialog({ accessToken, displayName, onClose, onCreated }: Props) {
  const titleId = useId();
  const pickerId = useId();
  const isMobile = useIsMobile();

  const [name, setName] = useState("");
  const [scope, setScope] = useState<BanterRoomScopeType>("topic");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<WriteRefusal | null>(null);
  const [clubs, setClubs] = useState<ClubSummary[]>([]);
  const [clubsState, setClubsState] = useState<ClubsState>("loading");
  const [clubId, setClubId] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const emojiButtonRef = useRef<HTMLButtonElement | null>(null);

  async function loadClubs() {
    setClubsState("loading");
    try {
      const joined = await listJoinedClubs(accessToken);
      setClubs(joined);
      setClubId((prev) => (joined.some((c) => c.id === prev) ? prev : (joined[0]?.id ?? "")));
      setClubsState("loaded");
    } catch {
      setClubsState("error");
    }
  }

  useEffect(() => {
    void loadClubs();
    // Only on open: the opener mounts this dialog fresh each time.
  }, []);

  const canCreateClubRoom = clubsState === "loaded" && clubs.length > 0;
  // A club scope can only be kept while the person still has a club to pick.
  const clubScopeBlocked = scope === "club" && !clubId;
  const titleEntered = name.trim().length > 0;
  const canPost = titleEntered && !pending && !clubScopeBlocked;
  const remaining = BANTER_ROOM_DESCRIPTION_MAX_LENGTH - description.length;

  function insertEmoji(emoji: string, keepOpen: boolean) {
    const area = descriptionRef.current;
    // The caret and selection the textarea kept while the picker had focus.
    const start = area?.selectionStart ?? description.length;
    const end = area?.selectionEnd ?? description.length;
    const next = description.slice(0, start) + emoji + description.slice(end);
    if (next.length > BANTER_ROOM_DESCRIPTION_MAX_LENGTH) return;
    setDescription(next);
    const caret = start + emoji.length;
    // After React has written the new value, put the caret just after the emoji.
    requestAnimationFrame(() => {
      const el = descriptionRef.current;
      if (!el) return;
      el.setSelectionRange(caret, caret);
      if (!keepOpen) el.focus({ preventScroll: true });
    });
    if (!keepOpen) setPickerOpen(false);
  }

  function closePicker(returnFocus: boolean) {
    setPickerOpen(false);
    if (returnFocus) emojiButtonRef.current?.focus({ preventScroll: true });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canPost) return;
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const isClubScope = scope === "club";
    setPending(true);
    setError(null);
    setRefusal(null);
    try {
      const room = await createRoom(accessToken, {
        name: trimmedName,
        scopeType: scope,
        ...(isClubScope ? { scopeRef: clubId } : {}),
        ...(trimmedDescription ? { description: trimmedDescription } : {}),
      });
      onCreated(room);
    } catch (err) {
      const reason = specificWriteRefusal(err);
      setRefusal(reason);
      setError(reason ? null : err instanceof BanterApiError ? err.message : "Couldn't create that room.");
      // The server rejected a club room (the membership may have ended since the list loaded):
      // re-read memberships so the picker stops offering it.
      if (isClubScope) void loadClubs();
      setPending(false);
    }
  }

  return (
    <BanterModal titleId={titleId} variant={isMobile ? "sheet" : "dialog"} busy={pending} onClose={onClose}>
      {isMobile && <span className="banter-modal__grab" aria-hidden="true" />}
      <form className="create-topic" onSubmit={handleSubmit}>
        <div className="create-topic__header">
          <h2 id={titleId} className="banter-modal__title">
            Create a topic
          </h2>
          <button type="button" className="create-topic__close" aria-label="Close" disabled={pending} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="create-topic__title-row">
          <span className="create-topic__avatar" aria-hidden="true">
            {initialsFor(displayName)}
          </span>
          <input
            type="text"
            className="banter-modal__input"
            aria-label="Title"
            placeholder="Title"
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={2}
            maxLength={120}
            required
            data-autofocus
          />
        </div>

        <label className="create-topic__field">
          <span className="banter-modal__label">Scope</span>
          <select
            className="banter-modal__input create-topic__select"
            aria-label="Scope"
            value={scope}
            onChange={(e) => setScope(e.target.value as BanterRoomScopeType)}
          >
            {SCOPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} disabled={o.value === "club" && !canCreateClubRoom}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {scope === "club" && canCreateClubRoom && (
          <label className="create-topic__field">
            <span className="banter-modal__label">Club</span>
            <select
              className="banter-modal__input create-topic__select"
              aria-label="Club"
              value={clubId}
              onChange={(e) => setClubId(e.target.value)}
            >
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {clubsState === "loading" && <p className="banter-modal__hint">Checking your club memberships…</p>}
        {clubsState === "loaded" && clubs.length === 0 && (
          <p className="banter-modal__hint">
            Club rooms are only for clubs you&rsquo;re a member of. Join a club to create one.
          </p>
        )}
        {clubsState === "error" && (
          <p className="banter-modal__hint" role="alert">
            Couldn&rsquo;t check your club memberships, so club rooms are unavailable.{" "}
            <button type="button" className="banter-modal__link" onClick={() => void loadClubs()}>
              Try again
            </button>
          </p>
        )}

        <div className="create-topic__field">
          <textarea
            ref={descriptionRef}
            className="banter-modal__input create-topic__description"
            aria-label="Description (optional)"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={BANTER_ROOM_DESCRIPTION_MAX_LENGTH}
            rows={4}
          />
          <div className="create-topic__description-foot">
            <button
              ref={emojiButtonRef}
              type="button"
              className="create-topic__emoji"
              aria-label="Emoji"
              aria-haspopup="true"
              aria-expanded={pickerOpen}
              aria-controls={pickerOpen ? pickerId : undefined}
              onClick={() => setPickerOpen((open) => !open)}
            >
              <span aria-hidden="true">☺</span>
            </button>
            <span className="create-topic__counter" aria-live="off">
              {description.length} / {BANTER_ROOM_DESCRIPTION_MAX_LENGTH}
            </span>
          </div>
          {pickerOpen && (
            <EmojiPicker
              id={pickerId}
              remaining={remaining}
              onPick={insertEmoji}
              onClose={closePicker}
              openerRef={emojiButtonRef}
            />
          )}
        </div>

        {refusal && <WriteRefusalNotice refusal={refusal} verb="create a room" className="banter-modal__error" />}
        {error && (
          <p className="banter-modal__error" role="alert">
            {error}
          </p>
        )}

        <div className="create-topic__actions">
          <button type="submit" className="banter-modal__primary" disabled={!canPost}>
            {pending ? "Creating…" : "Post"}
          </button>
        </div>
      </form>
    </BanterModal>
  );
}
