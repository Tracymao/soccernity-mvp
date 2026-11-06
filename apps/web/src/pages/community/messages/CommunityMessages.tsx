// Message sidebar + chat pop-ups for the Community page (B-066, Decision
// Log #378). Figma: frame "Community homepage with message sidebar and chat
// pop up" (1306:354) -- the "Messages Window" panel replaces the right rail,
// and "Chat Window" (1456:8885) / its minimised bar (1456:8930) float over
// the page.
//
// This file owns the state: the conversation list (GET /conversations,
// api/messaging.ts) and the open chats. Opening a conversation expands its
// chat and minimises any other open one; at most two chats are open (the
// frame shows one expanded and one minimised), so opening a third closes the
// oldest. Reading or sending in a chat updates the sidebar row (unread dot,
// preview, order) without refetching.
//
// DESKTOP ONLY. The Figma frame has no mobile variant, so on a phone-width
// viewport (useIsMobile, 820px, the point where CommunityPage.css already
// drops its side rails) nothing is rendered and nothing is fetched: the
// existing /messages pages (MessagesPage.tsx, ConversationPage.tsx) remain
// the mobile experience, reached from the header's messages icon.
//
// The safeguarding rules are the server's and are not re-derived here: a
// refused list (under-16) or send (guardian consent, a block, a minor
// recipient) shows the server's message as it came.
import { useCallback, useEffect, useState } from "react";
import { listConversations, MessagingApiError, type Conversation, type Message } from "../../../api/messaging";
import { isUnder16Restricted, UNDER_16_MESSAGE } from "../../../lib/under16";
import { useIsMobile } from "../../../layout/useIsMobile";
import ChatWindow from "./ChatWindow";
import MessagesSidebar, { type ListState } from "./MessagesSidebar";
import "./CommunityMessages.css";

const MAX_OPEN_CHATS = 2;

interface OpenChat {
  conversation: Conversation;
  minimised: boolean;
}

export interface CommunityMessagesProps {
  accessToken: string;
  currentUserId: string;
}

export default function CommunityMessages(props: CommunityMessagesProps) {
  const isMobile = useIsMobile();
  if (isMobile) return null;
  return <DesktopMessages {...props} />;
}

function DesktopMessages({ accessToken, currentUserId }: CommunityMessagesProps) {
  const [state, setState] = useState<ListState>("loading");
  const [restrictedMessage, setRestrictedMessage] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [openChats, setOpenChats] = useState<OpenChat[]>([]);

  const load = useCallback(async () => {
    setState("loading");
    setRestrictedMessage(null);
    try {
      const page = await listConversations(accessToken);
      setConversations(page.items);
      setCursor(page.nextCursor);
      setState("loaded");
    } catch (err) {
      setRestrictedMessage(isUnder16Restricted(err) ? UNDER_16_MESSAGE : null);
      setState("error");
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const page = await listConversations(accessToken, cursor);
      setConversations((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch (err) {
      setLoadMoreError(err instanceof MessagingApiError ? err.message : "Couldn’t load more conversations.");
    } finally {
      setLoadingMore(false);
    }
  }

  function openChat(conversation: Conversation) {
    setOpenChats((prev) => {
      const rest = prev.filter((c) => c.conversation.id !== conversation.id).map((c) => ({ ...c, minimised: true }));
      const opened: OpenChat = {
        conversation: prev.find((c) => c.conversation.id === conversation.id)?.conversation ?? conversation,
        minimised: false,
      };
      // Oldest first, newest last; past the limit the oldest is closed.
      return [...rest, opened].slice(-MAX_OPEN_CHATS);
    });
  }

  function setMinimised(id: string, minimised: boolean) {
    setOpenChats((prev) =>
      prev.map((c) => {
        if (c.conversation.id === id) return { ...c, minimised };
        // Expanding one chat minimises the other, as when opening from the list.
        return minimised ? c : { ...c, minimised: true };
      }),
    );
  }

  function closeChat(id: string) {
    setOpenChats((prev) => prev.filter((c) => c.conversation.id !== id));
  }

  const markRead = useCallback((id: string) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)));
  }, []);

  function recordSent(id: string, message: Message) {
    setConversations((prev) => {
      const target = prev.find((c) => c.id === id);
      if (!target) return prev;
      const updated: Conversation = {
        ...target,
        lastMessageAt: message.sentAt,
        lastMessage: { contentText: message.contentText, senderId: message.senderId, sentAt: message.sentAt },
      };
      return [updated, ...prev.filter((c) => c.id !== id)];
    });
  }

  return (
    <>
      <MessagesSidebar
        currentUserId={currentUserId}
        state={state}
        restrictedMessage={restrictedMessage}
        conversations={conversations}
        search={search}
        onSearchChange={setSearch}
        hasMore={cursor !== null}
        loadingMore={loadingMore}
        loadMoreError={loadMoreError}
        onLoadMore={loadMore}
        onRetry={load}
        openIds={openChats.map((c) => c.conversation.id)}
        onOpen={openChat}
      />

      {openChats.length > 0 && (
        <div className="chat-tray">
          {/* The expanded chat sits above the minimised bar, as in the frame. */}
          {[...openChats]
            .sort((a, b) => Number(a.minimised) - Number(b.minimised))
            .map((chat) => (
            <ChatWindow
              key={chat.conversation.id}
              accessToken={accessToken}
              currentUserId={currentUserId}
              conversation={chat.conversation}
              minimised={chat.minimised}
              onMinimise={() => setMinimised(chat.conversation.id, true)}
              onExpand={() => setMinimised(chat.conversation.id, false)}
              onClose={() => closeChat(chat.conversation.id)}
              onRead={markRead}
              onSent={recordSent}
            />
          ))}
        </div>
      )}
    </>
  );
}
