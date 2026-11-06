// A chat pop-up on the Community page (B-066). Figma source: "Chat Window"
// (1456:8885) and the minimised bar "Frame 5" (1456:8930) inside frame
// 1306:354, "Soccernity-MVP" file (weZWWqggy9j13eX8bhFgs6).
//
// Real data, the same endpoints ConversationPage.tsx uses (api/messaging.ts):
//   - GET  /conversations/:id/messages  newest-first pages, reversed here so
//     the list reads oldest at the top; "Load earlier messages" prepends.
//   - POST /conversations/:id/messages  send. The server's own refusal text
//     is shown as it came; a guardian-consent 403 also gets a link to
//     /guardian-consent (the PostComposer / ConversationPage convention).
//   - PATCH /conversations/:id/read     once, right after the first page
//     loads ("the person opened this chat").
//
// Not in the frame's behaviour and deliberately not built here:
//   - the per-message heart and delete icons and the dropdown beside the
//     name (the conversation actions menu, B-067);
//   - the video / photo / GIF / emoji controls in the footer (a message is
//     text only since B-259; no emoji picker exists);
//   - "Active 6h ago." (no presence data exists anywhere in the API).
// The messages are fetched when the window opens and after a send; there is
// no push or polling, because the API has none.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  getMessages,
  sendMessage,
  markConversationRead,
  MessagingApiError,
  type Conversation,
  type Message,
} from "../../../api/messaging";
import { isUnder16Restricted, UNDER_16_MESSAGE } from "../../../lib/under16";
import chatMinimise from "../../../assets/icons/chat-minimise.svg";
import chatClose from "../../../assets/icons/chat-close.svg";
import chatExpand from "../../../assets/icons/chat-expand.svg";
import { initialsFor, messageTimeLabel, TIME_LABEL_GAP_MS } from "./time";

type LoadState = "loading" | "loaded" | "error" | "not-found";

const MAX_LENGTH = 3000;

export interface ChatWindowProps {
  accessToken: string;
  currentUserId: string;
  conversation: Conversation;
  minimised: boolean;
  onMinimise: () => void;
  onExpand: () => void;
  onClose: () => void;
  onRead: (conversationId: string) => void;
  onSent: (conversationId: string, message: Message) => void;
}

export default function ChatWindow({
  accessToken,
  currentUserId,
  conversation,
  minimised,
  onMinimise,
  onExpand,
  onClose,
  onRead,
  onSent,
}: ChatWindowProps) {
  const name = conversation.otherParticipant?.publicName ?? "Deleted user";
  const initials = initialsFor(conversation.otherParticipant?.publicName ?? null);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [restricted, setRestricted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]); // oldest first
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const markedRead = useRef(false);
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;

  const conversationId = conversation.id;

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const page = await getMessages(accessToken, conversationId);
      setMessages([...page.items].reverse());
      setOlderCursor(page.nextCursor);
      stickToBottom.current = true;
      setLoadState("loaded");
      if (!markedRead.current) {
        markedRead.current = true;
        markConversationRead(accessToken, conversationId)
          .then(() => onReadRef.current(conversationId))
          .catch(() => {
            /* non-fatal: the chat already rendered */
          });
      }
    } catch (err) {
      setRestricted(isUnder16Restricted(err));
      setLoadState(err instanceof MessagingApiError && err.status === 404 ? "not-found" : "error");
    }
  }, [accessToken, conversationId]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep the newest message in view after a load or a send, but not after
  // "Load earlier messages" (that would jump away from where the reader is).
  useLayoutEffect(() => {
    if (minimised || loadState !== "loaded") return;
    const list = listRef.current;
    if (list && stickToBottom.current) list.scrollTop = list.scrollHeight;
  }, [messages, minimised, loadState]);

  async function loadOlder() {
    if (!olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await getMessages(accessToken, conversationId, olderCursor);
      stickToBottom.current = false;
      setMessages((prev) => [...[...page.items].reverse(), ...prev]);
      setOlderCursor(page.nextCursor);
    } catch {
      /* keep what is shown; the button stays and can be tried again */
    } finally {
      setLoadingOlder(false);
    }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const contentText = draft.trim();
    if (!contentText || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const message = await sendMessage(accessToken, conversationId, { contentText });
      stickToBottom.current = true;
      setMessages((prev) => [...prev, message]);
      setDraft("");
      onSent(conversationId, message);
    } catch (err) {
      setSendError(err instanceof MessagingApiError ? err.message : "Couldn’t send that message.");
    } finally {
      setSending(false);
    }
  }

  if (minimised) {
    return (
      <section className="chat-window chat-window--minimised" aria-label={`Chat with ${name} (minimised)`}>
        <button type="button" className="chat-minimised" onClick={onExpand} aria-label={`Open chat with ${name}`}>
          <span className="chat-avatar chat-avatar--small" aria-hidden="true">
            {initials}
          </span>
          <span className="chat-minimised__name">{name}</span>
          <img src={chatExpand} alt="" width={24} height={24} className="chat-minimised__chevron" />
        </button>
      </section>
    );
  }

  const isConsentBlocked = sendError !== null && /guardian consent/i.test(sendError);

  return (
    <section className="chat-window" aria-label={`Chat with ${name}`}>
      <header className="chat-window__header">
        <div className="chat-window__who">
          <span className="chat-avatar" aria-hidden="true">
            {initials}
          </span>
          <span className="chat-window__name">{name}</span>
        </div>
        <div className="chat-window__controls">
          <button type="button" className="chat-window__control" onClick={onMinimise} aria-label="Minimise chat">
            <img src={chatMinimise} alt="" width={12} height={2} />
          </button>
          <button type="button" className="chat-window__control" onClick={onClose} aria-label="Close chat">
            <img src={chatClose} alt="" width={13.4142} height={13.4142} />
          </button>
        </div>
      </header>

      <div className="chat-window__list" ref={listRef}>
        {loadState === "loading" && (
          <p className="chat-window__status" role="status">
            Loading messages…
          </p>
        )}

        {loadState === "not-found" && (
          <p className="chat-window__status" role="status">
            This conversation isn’t available.
          </p>
        )}

        {loadState === "error" && (
          <p className="chat-window__status chat-window__status--error" role="alert">
            {restricted ? UNDER_16_MESSAGE : "Couldn’t load this conversation. Please try again shortly."}{" "}
            {!restricted && (
              <button type="button" className="chat-window__retry" onClick={load}>
                Try again
              </button>
            )}
          </p>
        )}

        {loadState === "loaded" && (
          <>
            {olderCursor && (
              <button type="button" className="chat-window__older" onClick={loadOlder} disabled={loadingOlder}>
                {loadingOlder ? "Loading…" : "Load earlier messages"}
              </button>
            )}

            {messages.length === 0 && (
              <p className="chat-window__status" role="status">
                No messages yet — say hello below.
              </p>
            )}

            {messages.map((m, i) => {
              const mine = m.senderId === currentUserId;
              const prev = messages[i - 1];
              const showTime =
                !prev || new Date(m.sentAt).getTime() - new Date(prev.sentAt).getTime() >= TIME_LABEL_GAP_MS;
              const startsRun = !prev || prev.senderId !== m.senderId || showTime;
              return (
                <div key={m.id} className="chat-message-wrap">
                  {showTime && <p className="chat-message-time">{messageTimeLabel(m.sentAt)}</p>}
                  <div className={mine ? "chat-message chat-message--mine" : "chat-message"}>
                    {!mine && (
                      <span
                        className={startsRun ? "chat-avatar chat-avatar--small" : "chat-avatar chat-avatar--small chat-avatar--blank"}
                        aria-hidden="true"
                      >
                        {startsRun ? initials : ""}
                      </span>
                    )}
                    <p className="chat-message__bubble">{m.contentText}</p>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {sendError && (
        <p className="chat-window__send-error" role="alert">
          {sendError}
          {isConsentBlocked && (
            <>
              {" "}
              <Link to="/guardian-consent">Check your status</Link>
            </>
          )}
        </p>
      )}

      <form className="chat-window__composer" onSubmit={handleSend}>
        <input
          type="text"
          className="chat-window__input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a message…"
          maxLength={MAX_LENGTH}
          aria-label={`Write a message to ${name}`}
          disabled={loadState !== "loaded"}
        />
        <button type="submit" className="chat-window__send" disabled={loadState !== "loaded" || sending || !draft.trim()}>
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
    </section>
  );
}
