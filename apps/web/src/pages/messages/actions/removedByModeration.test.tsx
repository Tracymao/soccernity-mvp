// B-289 (Decision Log #483, Figma M1 to M3, D1, D2): a message a moderator removed. The server sends it to BOTH
// people as { id, sentAt, removedByModeration: true } and nothing else (no text, no sender), both in the thread
// and as the last-message preview. It is drawn as the "removed by Soccernity" placeholder, with no menu, no edit,
// no delete and no report. Run on BOTH conversation surfaces (the mobile page and the Community pop-up), like
// messageActions.test.tsx, so the two cannot drift apart.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import ConversationPage from "../ConversationPage";
import MessagesPage from "../../MessagesPage";
import CommunityMessages from "../../community/messages/CommunityMessages";
import {
  MessagingApiError,
  type Conversation,
  type Message,
  type RemovedMessage,
  type ThreadMessage,
} from "../../../api/messaging";
import { REMOVED_MESSAGE_TEXT } from "../../../components/removed/removedContent";

vi.mock("../../../api/messaging", async () => {
  const actual = await vi.importActual<typeof import("../../../api/messaging")>("../../../api/messaging");
  return {
    ...actual,
    listConversations: vi.fn(),
    getMessages: vi.fn(),
    sendMessage: vi.fn(),
    markConversationRead: vi.fn(),
    editMessage: vi.fn(),
    deleteMessage: vi.fn(),
    deleteConversation: vi.fn(),
  };
});
vi.mock("../../../api/moderation", async () => {
  const actual = await vi.importActual<typeof import("../../../api/moderation")>("../../../api/moderation");
  return { ...actual, createReport: vi.fn() };
});

import {
  listConversations,
  getMessages,
  markConversationRead,
  editMessage,
  deleteMessage,
} from "../../../api/messaging";
import { seedSession, clearSession } from "../../../test/session";

const ME = "user-me";
const OTHER = "u2";
const MINUTE = 60_000;
const TAG = "[COPY PENDING LEGAL REVIEW]";

function base64UrlEncode(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const TOKEN = `${base64UrlEncode({ alg: "none" })}.${base64UrlEncode({ sub: ME, role: "fan" })}.sig`;

function ago(minutes: number): string {
  return new Date(Date.now() - minutes * MINUTE).toISOString();
}

function msg(overrides: Partial<Message> = {}): Message {
  return {
    id: "m",
    conversationId: "c1",
    senderId: OTHER,
    contentText: "text",
    sentAt: ago(1),
    readAt: null,
    ...overrides,
  };
}

const BEFORE = msg({ id: "m-before", senderId: OTHER, contentText: "Before the removed one", sentAt: ago(20) });
const REMOVED: RemovedMessage = { id: "m-removed", sentAt: ago(10), removedByModeration: true };
const AFTER = msg({ id: "m-after", senderId: ME, contentText: "After the removed one", sentAt: ago(2) });
const MINE_RECENT = msg({ id: "m-mine", senderId: ME, contentText: "My recent message", sentAt: ago(1) });

function conversation(lastMessage: Conversation["lastMessage"] = null): Conversation {
  return {
    id: "c1",
    otherParticipant: { id: OTHER, publicName: "Matthew Amuloko" },
    lastMessageAt: ago(10),
    createdAt: ago(600),
    lastMessage,
    unreadCount: 0,
  };
}

function serve(items: ThreadMessage[]) {
  vi.mocked(getMessages).mockResolvedValue({ items: [...items].reverse(), nextCursor: null });
}

function setWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
}

type Surface = { name: string; open: (anchorText: string) => Promise<void> };

const mobilePage: Surface = {
  name: "mobile page",
  async open(anchorText) {
    seedSession(TOKEN);
    render(
      <MemoryRouter
        initialEntries={[
          { pathname: "/messages/c1", state: { otherParticipant: { id: OTHER, publicName: "Matthew Amuloko" } } },
        ]}
      >
        <Routes>
          <Route path="/messages/:conversationId" element={<ConversationPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect((await screen.findAllByText(anchorText)).length).toBeGreaterThan(0);
  },
};

const popUp: Surface = {
  name: "Community pop-up",
  async open(anchorText) {
    setWidth(1280);
    vi.mocked(listConversations).mockResolvedValue({ items: [conversation()], nextCursor: null });
    render(
      <MemoryRouter initialEntries={["/community"]}>
        <Routes>
          <Route path="/community" element={<CommunityMessages accessToken={TOKEN} currentUserId={ME} />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByText("Matthew Amuloko"));
    expect((await screen.findAllByText(anchorText)).length).toBeGreaterThan(0);
  },
};

const originalWidth = window.innerWidth;

beforeEach(() => {
  clearSession();
  vi.mocked(markConversationRead).mockResolvedValue({ conversationId: "c1", markedRead: 0 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  setWidth(originalWidth);
});

// The words of the placeholder without the tag, which the component prints at a smaller size in its own span.
const REMOVED_LABEL = REMOVED_MESSAGE_TEXT.replace(TAG, "").trim();

function removedPlaceholders(): HTMLElement[] {
  return screen.queryAllByTestId("removed-placeholder");
}

describe.each([mobilePage, popUp])("a message removed by a moderator on the $name", (surface) => {
  it("is drawn as the placeholder, in its place, with the tag and nothing of the message", async () => {
    serve([BEFORE, REMOVED, AFTER]);
    await surface.open("After the removed one");

    const placeholders = removedPlaceholders();
    expect(placeholders).toHaveLength(1);
    expect(placeholders[0].textContent).toContain(REMOVED_LABEL);
    expect(placeholders[0].textContent).toContain(TAG);
    // It sits between the messages around it, in order.
    const order = Array.from(document.body.querySelectorAll("p, .removed-placeholder")).map((n) => n.textContent ?? "");
    const iBefore = order.findIndex((t) => t.includes("Before the removed one"));
    const iRemoved = order.findIndex((t) => t.includes(REMOVED_LABEL));
    const iAfter = order.findIndex((t) => t.includes("After the removed one"));
    expect(iBefore).toBeGreaterThanOrEqual(0);
    expect(iRemoved).toBeGreaterThan(iBefore);
    expect(iAfter).toBeGreaterThan(iRemoved);
  });

  it("is not the 'This message was deleted' look", async () => {
    serve([BEFORE, REMOVED, AFTER]);
    await surface.open("After the removed one");
    expect(screen.queryByText("This message was deleted")).toBeNull();
    expect(removedPlaceholders()[0].querySelector(".msg-deleted")).toBeNull();
  });

  it("has no menu, no edit, no delete and no report on it", async () => {
    serve([BEFORE, REMOVED, AFTER]);
    await surface.open("After the removed one");
    const placeholder = removedPlaceholders()[0];
    expect(placeholder.closest(".msg-host")).toBeNull();
    expect(within(placeholder).queryByRole("button")).toBeNull();
    expect(within(placeholder).queryByRole("link")).toBeNull();
    // The messages with text still have their own "..." button (their host): one each, none for the stub.
    expect(screen.getAllByRole("button", { name: "Message options" })).toHaveLength(2);
    expect(screen.queryByText(/Edited/)).toBeNull();
    expect(screen.queryByText(/Seen /)).toBeNull();
  });

  it("a long-press on it opens nothing", async () => {
    serve([BEFORE, REMOVED, AFTER]);
    await surface.open("After the removed one");
    const placeholder = removedPlaceholders()[0];
    fireEvent.touchStart(placeholder);
    fireEvent.contextMenu(placeholder);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the other messages keep all their actions", async () => {
    serve([BEFORE, REMOVED, AFTER]);
    await surface.open("After the removed one");
    const host = screen.getByText("After the removed one").closest(".msg-host") as HTMLElement;
    fireEvent.click(within(host).getByRole("button", { name: "Message options" }));
    const menu = screen.getByRole("menu", { name: "Message actions" });
    expect(within(menu).getByRole("menuitem", { name: /Edit/ })).toBeTruthy();
  });

  it("a thread of nothing but removed messages still renders", async () => {
    serve([REMOVED, { ...REMOVED, id: "m-removed-2", sentAt: ago(5) }]);
    await surface.open(REMOVED_LABEL);
    expect(removedPlaceholders()).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Message options" })).toBeNull();
  });

  it("when someone removes my message while the page is open, an edit is refused with message_removed and it becomes the placeholder", async () => {
    serve([BEFORE, MINE_RECENT]);
    await surface.open("My recent message");
    const host = screen.getByText("My recent message").closest(".msg-host") as HTMLElement;
    fireEvent.click(within(host).getByRole("button", { name: "Message options" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "Message actions" })).getByRole("menuitem", { name: /Edit/ }));
    const input = screen.getByRole("textbox", { name: "Edit message text" });
    vi.mocked(editMessage).mockRejectedValueOnce(
      new MessagingApiError("This message was removed", { status: 409, code: "message_removed" }),
    );
    fireEvent.change(input, { target: { value: "Changed my mind" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(removedPlaceholders()).toHaveLength(1));
    expect(screen.queryByText("My recent message")).toBeNull();
    // The edit bar is gone and the composer is back; no error line is left over.
    expect(screen.queryByText("Editing message")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("textbox", { name: /Write a message/ })).toBeTruthy();
  });

  it("when a moderator removes my message while the page is open, a delete is refused with message_removed and it becomes the placeholder", async () => {
    serve([BEFORE, MINE_RECENT]);
    await surface.open("My recent message");
    const host = screen.getByText("My recent message").closest(".msg-host") as HTMLElement;
    fireEvent.click(within(host).getByRole("button", { name: "Message options" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "Message actions" })).getByRole("menuitem", { name: /Delete/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete for everyone" }));
    vi.mocked(deleteMessage).mockRejectedValueOnce(
      new MessagingApiError("This message was removed", { status: 409, code: "message_removed" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: /^Delete for everyone$/ }));

    await waitFor(() => expect(removedPlaceholders()).toHaveLength(1));
    expect(screen.queryByText("My recent message")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("the conversation list preview of a removed last message", () => {
  const preview = { id: "m-removed", sentAt: ago(10), removedByModeration: true as const };

  it("the inbox page shows the removed wording, not a text and not 'This message was deleted'", async () => {
    seedSession(TOKEN);
    vi.mocked(listConversations).mockResolvedValue({ items: [conversation(preview)], nextCursor: null });
    render(
      <MemoryRouter initialEntries={["/messages"]}>
        <Routes>
          <Route path="/messages" element={<MessagesPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText("Matthew Amuloko");
    expect(screen.getByText(REMOVED_MESSAGE_TEXT)).toBeTruthy();
    expect(screen.queryByText(/This message was deleted/)).toBeNull();
    expect(screen.queryByText(/You:/)).toBeNull();
  });

  it("the Community sidebar shows the removed wording with no 'You:' prefix", async () => {
    setWidth(1280);
    vi.mocked(listConversations).mockResolvedValue({ items: [conversation(preview)], nextCursor: null });
    render(
      <MemoryRouter initialEntries={["/community"]}>
        <Routes>
          <Route path="/community" element={<CommunityMessages accessToken={TOKEN} currentUserId={ME} />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText("Matthew Amuloko");
    expect(screen.getByText(REMOVED_MESSAGE_TEXT)).toBeTruthy();
    expect(screen.queryByText(/You:/)).toBeNull();
  });

  it("a removed last message after a refresh of the sidebar from an opened chat keeps showing the removed wording", async () => {
    setWidth(1280);
    // The chat is opened with the removed message last; no change was made, so the preview is the list's own.
    vi.mocked(listConversations).mockResolvedValue({ items: [conversation(preview)], nextCursor: null });
    serve([BEFORE, REMOVED]);
    render(
      <MemoryRouter initialEntries={["/community"]}>
        <Routes>
          <Route path="/community" element={<CommunityMessages accessToken={TOKEN} currentUserId={ME} />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByText("Matthew Amuloko"));
    await screen.findByText("Before the removed one");
    // One in the open chat, one in the sidebar row.
    expect(screen.getAllByText(REMOVED_LABEL, { exact: false }).length).toBeGreaterThanOrEqual(2);
  });
});

// B-295 (Decision Log #489): the stub carries isMine, so it sits on the viewer's side of the thread.
describe.each([
  { ...mobilePage, sideOf: (el: HTMLElement) => el.closest(".conversation-bubble--removed") as HTMLElement, mineClass: "conversation-bubble--removed-mine" },
  { ...popUp, sideOf: (el: HTMLElement) => el.closest(".chat-message") as HTMLElement, mineClass: "chat-message--mine" },
])("which side a removed message sits on, $name", (surface) => {
  it("sits on the right when isMine is true", async () => {
    serve([BEFORE, { ...REMOVED, isMine: true }, AFTER]);
    await surface.open("After the removed one");
    expect(surface.sideOf(removedPlaceholders()[0]).classList.contains(surface.mineClass)).toBe(true);
  });

  it("sits on the left when isMine is false", async () => {
    serve([BEFORE, { ...REMOVED, isMine: false }, AFTER]);
    await surface.open("After the removed one");
    expect(surface.sideOf(removedPlaceholders()[0]).classList.contains(surface.mineClass)).toBe(false);
  });

  it("an older stub with no isMine is treated as the other person's and does not crash", async () => {
    serve([BEFORE, REMOVED, AFTER]);
    await surface.open("After the removed one");
    expect(removedPlaceholders()).toHaveLength(1);
    expect(surface.sideOf(removedPlaceholders()[0]).classList.contains(surface.mineClass)).toBe(false);
  });

  it("two removed messages on opposite sides each keep their own side", async () => {
    serve([
      { ...REMOVED, id: "r-theirs", sentAt: ago(10), isMine: false },
      { ...REMOVED, id: "r-mine", sentAt: ago(5), isMine: true },
    ]);
    await surface.open(REMOVED_LABEL);
    const sides = removedPlaceholders().map((p) => surface.sideOf(p).classList.contains(surface.mineClass));
    expect(sides).toEqual([false, true]);
  });

  it("a message of mine refused with message_removed lands on the right", async () => {
    serve([BEFORE, MINE_RECENT]);
    await surface.open("My recent message");
    const host = screen.getByText("My recent message").closest(".msg-host") as HTMLElement;
    fireEvent.click(within(host).getByRole("button", { name: "Message options" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "Message actions" })).getByRole("menuitem", { name: /Edit/ }));
    vi.mocked(editMessage).mockRejectedValueOnce(
      new MessagingApiError("This message was removed", { status: 409, code: "message_removed" }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Edit message text" }), { target: { value: "Changed my mind" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(removedPlaceholders()).toHaveLength(1));
    expect(surface.sideOf(removedPlaceholders()[0]).classList.contains(surface.mineClass)).toBe(true);
  });
});

describe("the conversation list preview of a removed last message is unchanged by isMine", () => {
  it.each([true, false, undefined])("keeps the removed wording and no 'You:' prefix (isMine %s)", async (isMine) => {
    seedSession(TOKEN);
    vi.mocked(listConversations).mockResolvedValue({
      items: [conversation({ id: "m-removed", sentAt: ago(10), removedByModeration: true as const, isMine })],
      nextCursor: null,
    });
    render(
      <MemoryRouter initialEntries={["/messages"]}>
        <Routes>
          <Route path="/messages" element={<MessagesPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText("Matthew Amuloko");
    expect(screen.getByText(REMOVED_MESSAGE_TEXT)).toBeTruthy();
    expect(screen.queryByText(/You:/)).toBeNull();
  });
});
