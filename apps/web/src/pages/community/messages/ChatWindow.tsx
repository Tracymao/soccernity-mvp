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
// B-067 (Decision Log #472 (b)) adds, from the same shared pieces the mobile
// page uses (pages/messages/actions/): edit your own message for 15 minutes,
// delete for me, delete for everyone, the "..." menu on each bubble, and the
// conversation actions menu in the header (Mark as read, View profile, Block,
// Delete chat).
//
// B-061 (read receipts): "Seen 08:09 AM" under YOUR latest message when the
// server returned a read time for it (Figma V3 / V4). The server decides who
// may see a read time; see messages/actions/messageActionRules.ts.
//
// Not in the frame's behaviour and deliberately not built here:
//   - the per-message heart icon;
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
  isDeletedMessage,
  type Conversation,
  type Message,
  type MessagePreview,
  type ThreadMessage,
} from "../../../api/messaging";
import { isUnder16Restricted, UNDER_16_MESSAGE } from "../../../lib/under16";
import chatMinimise from "../../../assets/icons/chat-minimise.svg";
import chatClose from "../../../assets/icons/chat-close.svg";
import chatExpand from "../../../assets/icons/chat-expand.svg";
import {
  ConversationActions,
  DeleteMessageDialog,
  DeletedText,
  EditBar,
  MessageHost,
  SeenLabel,
} from "../../messages/actions/ActionUi";
import { useConversationActions } from "../../messages/actions/useConversationActions";
import { useMessageActions } from "../../messages/actions/useMessageActions";
import { firstNameOf, seenLabelMessageId } from "../../messages/actions/messageActionRules";
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
  // After an edit or a delete, the new last message for the sidebar preview
  // (null when no message is left to show).
  onPreviewChange?: (conversationId: string, preview: MessagePreview | null) => void;
  // "Delete chat": the chat closes and leaves the sidebar.
  onChatDeleted?: (conversationId: string) => void;
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
  onPreviewChange,
  onChatDeleted,
}: ChatWindowProps) {
  const name = conversation.otherParticipant?.publicName ?? "Deleted user";
  const initials = initialsFor(conversation.otherParticipant?.publicName ?? null);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [restricted, setRestricted] = useState(false);
  const [messages, setMessages] = useState<ThreadMessage[]>([]); // oldest first
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
  const otherName = conversation.otherParticipant?.publicName ?? null;
  const onPreviewRef = useRef(onPreviewChange);
  onPreviewRef.current = onPreviewChange;

  const messageActions = useMessageActions({
    accessToken,
    conversationId,
    currentUserId,
    otherName,
    messages,
    setMessages,
  });
  const conversationActions = useConversationActions({
    accessToken,
    conversationId,
    otherId: conversation.otherParticipant?.id ?? null,
    onMarkedRead: () => onReadRef.current(conversationId),
    onChatDeleted: () => onChatDeleted?.(conversationId),
  });

  // After an edit or a delete that worked, tell the sidebar what the last
  // message is now. Not done on load, so opening a chat never rewrites a row.
  const changeTick = messageActions.changeTick;
  useEffect(() => {
    if (changeTick === 0) return;
    const last = [...messages].reverse().find((m) => !isDeletedMessage(m));
    if (last && !isDeletedMessage(last)) {
      onPreviewRef.current?.(conversationId, {
        contentText: last.contentText,
        senderId: last.senderId,
        sentAt: last.sentAt,
      });
    } else if (!olderCursor) {
      onPreviewRef.current?.(conversationId, null);
    }
    // Runs only when a change succeeded.
  }, [changeTick]); // eslint-disable-line

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

  // B-061: "Seen 08:09 AM" under my latest message, only when the server sent a read time for it.
  const seenId = seenLabelMessageId(messages, currentUserId);

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
          <ConversationActions
            actions={conversationActions}
            accessToken={accessToken}
            otherName={otherName}
            firstName={firstNameOf(otherName)}
            triggerClassName="chat-window__control"
          />
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
              const deleted = isDeletedMessage(m);
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
                    {deleted ? (
                      <p className="chat-message__bubble chat-message__bubble--deleted">
                        <DeletedText />
                      </p>
                    ) : (
                      <MessageHost message={m} mine={mine} actions={messageActions}>
                        <p className="chat-message__bubble">
                          {m.contentText}
                          {m.editedAt && <span className="chat-message__edited">Edited</span>}
                        </p>
                      </MessageHost>
                    )}
                  </div>
                  {!deleted && m.id === seenId && m.readAt && <SeenLabel readAt={m.readAt} />}
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

      {messageActions.edit ? (
        <EditBar actions={messageActions} />
      ) : (
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
      )}

      <DeleteMessageDialog actions={messageActions} />
    </section>
  );
}
