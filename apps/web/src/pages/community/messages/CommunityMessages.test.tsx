// B-066: the message sidebar and chat pop-ups on the Community page. Mocks
// src/api/messaging.ts; plain DOM assertions, one test per state.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import CommunityMessages from "./CommunityMessages";
import type { Conversation, Message } from "../../../api/messaging";

vi.mock("../../../api/messaging", async () => {
  const actual = await vi.importActual<typeof import("../../../api/messaging")>("../../../api/messaging");
  return {
    ...actual,
    listConversations: vi.fn(),
    getMessages: vi.fn(),
    sendMessage: vi.fn(),
    markConversationRead: vi.fn(),
  };
});

import { listConversations, getMessages, sendMessage, markConversationRead, MessagingApiError } from "../../../api/messaging";
import { UNDER_16_MESSAGE } from "../../../lib/under16";

const HOUR = 3_600_000;
const ME = "user-me";

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "c1",
    otherParticipant: { id: "u2", publicName: "Kingsley Chukwudi" },
    lastMessageAt: new Date(Date.now() - 22 * HOUR).toISOString(),
    createdAt: new Date(Date.now() - 48 * HOUR).toISOString(),
    lastMessage: { contentText: "Morning", senderId: ME, sentAt: new Date(Date.now() - 22 * HOUR).toISOString() },
    unreadCount: 0,
    ...overrides,
  };
}

const unreadConversation = conversation({
  id: "c2",
  otherParticipant: { id: "u3", publicName: "Emeka Hassan" },
  lastMessageAt: new Date(Date.now() - 10 * HOUR).toISOString(),
  lastMessage: { contentText: "Hey Man", senderId: "u3", sentAt: new Date(Date.now() - 10 * HOUR).toISOString() },
  unreadCount: 2,
});

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: "m1",
    conversationId: "c1",
    senderId: "u2",
    contentText: "Lorem ipsum dolor",
    sentAt: new Date(Date.now() - 2 * HOUR).toISOString(),
    readAt: null,
    ...overrides,
  };
}

function setWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
}

function renderDock() {
  return render(
    <MemoryRouter>
      <CommunityMessages accessToken="token-1" currentUserId={ME} />
    </MemoryRouter>,
  );
}

const originalWidth = window.innerWidth;

beforeEach(() => {
  setWidth(1280);
  vi.mocked(listConversations).mockResolvedValue({ items: [conversation(), unreadConversation], nextCursor: null });
  vi.mocked(getMessages).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(markConversationRead).mockResolvedValue({ conversationId: "c1", markedRead: 0 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  setWidth(originalWidth);
});

describe("message sidebar", () => {
  it("shows a loading line, then one row per conversation with name, preview, age and an unread dot", async () => {
    renderDock();
    expect(screen.getByText("Loading your messages…")).toBeTruthy();

    expect(await screen.findByText("Kingsley Chukwudi")).toBeTruthy();
    expect(screen.getByText("Emeka Hassan")).toBeTruthy();
    // Own last message is prefixed; someone else's is not.
    expect(screen.getByText("You: Morning")).toBeTruthy();
    expect(screen.getByText("Hey Man")).toBeTruthy();
    expect(screen.getByText("22h")).toBeTruthy();
    expect(screen.getByText("10h")).toBeTruthy();
    // Only the unread conversation carries the dot, labelled with its count.
    expect(screen.getAllByAltText(/unread/)).toHaveLength(1);
    expect(screen.getByAltText("2 unread")).toBeTruthy();
    expect(vi.mocked(listConversations)).toHaveBeenCalledWith("token-1");
  });

  it("has a Messages title, the Inbox chip and a compose link to the recipient picker", async () => {
    renderDock();
    await screen.findByText("Kingsley Chukwudi");
    expect(screen.getByRole("heading", { name: "Messages" })).toBeTruthy();
    expect(screen.getByText("Inbox")).toBeTruthy();
    expect(screen.getByRole("link", { name: "New message" }).getAttribute("href")).toBe("/messages/new");
  });

  it("shows the empty state with a link to start a conversation", async () => {
    vi.mocked(listConversations).mockResolvedValue({ items: [], nextCursor: null });
    renderDock();
    expect(await screen.findByText("You don’t have any messages yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Start a conversation" }).getAttribute("href")).toBe("/messages/new");
  });

  it("shows a load error with a working Try again", async () => {
    vi.mocked(listConversations).mockRejectedValueOnce(new MessagingApiError("x", { status: 500 }));
    renderDock();
    expect(await screen.findByText(/Couldn’t load your messages/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Kingsley Chukwudi")).toBeTruthy();
  });

  it("shows the plain under-16 message, with no retry, when the server refuses the list", async () => {
    vi.mocked(listConversations).mockRejectedValueOnce(
      new MessagingApiError(UNDER_16_MESSAGE, { status: 403, code: "under_16_restricted" }),
    );
    renderDock();
    expect(await screen.findByText(UNDER_16_MESSAGE)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("filters the loaded conversations by name and says when nothing matches", async () => {
    renderDock();
    await screen.findByText("Kingsley Chukwudi");
    const search = screen.getByRole("searchbox", { name: "Search messages" });

    fireEvent.change(search, { target: { value: "emeka" } });
    expect(screen.queryByText("Kingsley Chukwudi")).toBeNull();
    expect(screen.getByText("Emeka Hassan")).toBeTruthy();

    fireEvent.change(search, { target: { value: "zzz" } });
    expect(screen.getByText("No conversations match that name.")).toBeTruthy();
  });

  it("loads the next page of conversations", async () => {
    vi.mocked(listConversations)
      .mockResolvedValueOnce({ items: [conversation()], nextCursor: "next" })
      .mockResolvedValueOnce({ items: [unreadConversation], nextCursor: null });
    renderDock();
    await screen.findByText("Kingsley Chukwudi");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Emeka Hassan")).toBeTruthy();
    expect(vi.mocked(listConversations)).toHaveBeenLastCalledWith("token-1", "next");
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("shows an error line when the next page fails, keeping the rows", async () => {
    vi.mocked(listConversations)
      .mockResolvedValueOnce({ items: [conversation()], nextCursor: "next" })
      .mockRejectedValueOnce(new MessagingApiError("Couldn’t load more conversations.", { status: 500 }));
    renderDock();
    await screen.findByText("Kingsley Chukwudi");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Couldn’t load more conversations.")).toBeTruthy();
    expect(screen.getByText("Kingsley Chukwudi")).toBeTruthy();
  });

  it("renders nothing and fetches nothing at phone width (the frame has no mobile variant)", () => {
    setWidth(500);
    const { container } = renderDock();
    expect(container.innerHTML).toBe("");
    expect(vi.mocked(listConversations)).not.toHaveBeenCalled();
  });
});

describe("chat pop-up", () => {
  async function openFirstChat() {
    renderDock();
    const row = (await screen.findByText("Kingsley Chukwudi")).closest("button") as HTMLElement;
    fireEvent.click(row);
    return screen.findByRole("region", { name: "Chat with Kingsley Chukwudi" });
  }

  it("opens a chat from a row, loads the messages oldest first and marks the conversation read", async () => {
    vi.mocked(getMessages).mockResolvedValue({
      // The API is newest first.
      items: [
        message({ id: "m2", senderId: ME, contentText: "newer message", sentAt: new Date(Date.now() - 1 * HOUR).toISOString() }),
        message({ id: "m1", contentText: "older message" }),
      ],
      nextCursor: null,
    });
    const chat = await openFirstChat();

    const older = await within(chat).findByText("older message");
    const newer = within(chat).getByText("newer message");
    expect(older.compareDocumentPosition(newer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(vi.mocked(getMessages)).toHaveBeenCalledWith("token-1", "c1");
    await waitFor(() => expect(vi.mocked(markConversationRead)).toHaveBeenCalledWith("token-1", "c1"));
  });

  it("clears the unread dot in the sidebar once the chat has been read", async () => {
    vi.mocked(markConversationRead).mockResolvedValue({ conversationId: "c2", markedRead: 2 });
    renderDock();
    const row = (await screen.findByText("Emeka Hassan")).closest("button") as HTMLElement;
    expect(screen.getByAltText("2 unread")).toBeTruthy();
    fireEvent.click(row);
    await screen.findByRole("region", { name: "Chat with Emeka Hassan" });
    await waitFor(() => expect(screen.queryByAltText("2 unread")).toBeNull());
  });

  it("shows a time label before the first message and after a long gap", async () => {
    vi.mocked(getMessages).mockResolvedValue({
      items: [
        message({ id: "m2", contentText: "second", sentAt: new Date(Date.now() - 1 * HOUR).toISOString() }),
        message({ id: "m1", contentText: "first", sentAt: new Date(Date.now() - 5 * HOUR).toISOString() }),
      ],
      nextCursor: null,
    });
    const chat = await openFirstChat();
    await within(chat).findByText("first");
    // Two messages four hours apart -> two labels; a time like "08:00 AM".
    expect(within(chat).getAllByText(/\b\d{2}:\d{2} (AM|PM)$/)).toHaveLength(2);
  });

  it("shows 'No messages yet' for an empty thread", async () => {
    const chat = await openFirstChat();
    expect(await within(chat).findByText("No messages yet — say hello below.")).toBeTruthy();
  });

  it("sends a message, shows it, and moves the conversation to the top with the new preview", async () => {
    vi.mocked(sendMessage).mockResolvedValue(
      message({ id: "m9", senderId: ME, contentText: "See you there", sentAt: new Date().toISOString() }),
    );
    // Start from the unread conversation on top so the move is visible.
    vi.mocked(listConversations).mockResolvedValue({ items: [unreadConversation, conversation()], nextCursor: null });
    renderDock();
    const row = (await screen.findByText("Kingsley Chukwudi")).closest("button") as HTMLElement;
    fireEvent.click(row);
    const chat = await screen.findByRole("region", { name: "Chat with Kingsley Chukwudi" });
    await within(chat).findByText("No messages yet — say hello below.");

    const input = within(chat).getByLabelText("Write a message to Kingsley Chukwudi");
    fireEvent.change(input, { target: { value: "  See you there  " } });
    fireEvent.click(within(chat).getByRole("button", { name: "Send" }));

    expect(await within(chat).findByText("See you there")).toBeTruthy();
    expect(vi.mocked(sendMessage)).toHaveBeenCalledWith("token-1", "c1", { contentText: "See you there" });
    expect((input as HTMLInputElement).value).toBe("");
    // Sidebar: preview updated and Kingsley now first.
    await waitFor(() => expect(screen.getByText("You: See you there")).toBeTruthy());
    const rows = screen.getAllByRole("list")[0].querySelectorAll("li");
    expect(rows[0].textContent).toContain("Kingsley Chukwudi");
  });

  it("does not send a blank message", async () => {
    const chat = await openFirstChat();
    await within(chat).findByText("No messages yet — say hello below.");
    const send = within(chat).getByRole("button", { name: "Send" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(within(chat).getByLabelText("Write a message to Kingsley Chukwudi"), { target: { value: "   " } });
    expect(send.disabled).toBe(true);
    expect(vi.mocked(sendMessage)).not.toHaveBeenCalled();
  });

  it("shows the server's refusal as it came, and keeps the draft", async () => {
    vi.mocked(sendMessage).mockRejectedValue(new MessagingApiError("You can't message this person.", { status: 403 }));
    const chat = await openFirstChat();
    await within(chat).findByText("No messages yet — say hello below.");
    const input = within(chat).getByLabelText("Write a message to Kingsley Chukwudi") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.click(within(chat).getByRole("button", { name: "Send" }));
    expect(await within(chat).findByRole("alert")).toHaveProperty("textContent", "You can't message this person.");
    expect(input.value).toBe("hello");
  });

  it("links to the guardian-consent page when the refusal is the consent block", async () => {
    vi.mocked(sendMessage).mockRejectedValue(
      new MessagingApiError("Guardian consent is required to message other people.", { status: 403 }),
    );
    const chat = await openFirstChat();
    await within(chat).findByText("No messages yet — say hello below.");
    fireEvent.change(within(chat).getByLabelText("Write a message to Kingsley Chukwudi"), { target: { value: "hi" } });
    fireEvent.click(within(chat).getByRole("button", { name: "Send" }));
    const link = await within(chat).findByRole("link", { name: "Check your status" });
    expect(link.getAttribute("href")).toBe("/guardian-consent");
  });

  it("loads earlier messages and puts them above the ones shown", async () => {
    vi.mocked(getMessages)
      .mockResolvedValueOnce({ items: [message({ id: "m2", contentText: "recent" })], nextCursor: "older" })
      .mockResolvedValueOnce({ items: [message({ id: "m1", contentText: "ancient" })], nextCursor: null });
    const chat = await openFirstChat();
    await within(chat).findByText("recent");
    fireEvent.click(within(chat).getByRole("button", { name: "Load earlier messages" }));
    const ancient = await within(chat).findByText("ancient");
    expect(ancient.compareDocumentPosition(within(chat).getByText("recent")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(vi.mocked(getMessages)).toHaveBeenLastCalledWith("token-1", "c1", "older");
    expect(within(chat).queryByRole("button", { name: "Load earlier messages" })).toBeNull();
  });

  it("says the conversation isn't available on a 404, and disables the composer", async () => {
    vi.mocked(getMessages).mockRejectedValue(new MessagingApiError("x", { status: 404 }));
    const chat = await openFirstChat();
    expect(await within(chat).findByText("This conversation isn’t available.")).toBeTruthy();
    expect((within(chat).getByLabelText("Write a message to Kingsley Chukwudi") as HTMLInputElement).disabled).toBe(true);
  });

  it("shows a load error with Try again, and the plain under-16 message without it", async () => {
    vi.mocked(getMessages).mockRejectedValueOnce(new MessagingApiError("x", { status: 500 }));
    const chat = await openFirstChat();
    expect(await within(chat).findByText(/Couldn’t load this conversation/)).toBeTruthy();
    fireEvent.click(within(chat).getByRole("button", { name: "Try again" }));
    expect(await within(chat).findByText("No messages yet — say hello below.")).toBeTruthy();

    cleanup();
    vi.mocked(getMessages).mockRejectedValueOnce(
      new MessagingApiError(UNDER_16_MESSAGE, { status: 403, code: "under_16_restricted" }),
    );
    const second = await openFirstChat();
    expect(await within(second).findByText(UNDER_16_MESSAGE)).toBeTruthy();
    expect(within(second).queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("minimises to a bar, expands again, and closes", async () => {
    const chat = await openFirstChat();
    await within(chat).findByText("No messages yet — say hello below.");

    fireEvent.click(within(chat).getByRole("button", { name: "Minimise chat" }));
    const bar = await screen.findByRole("region", { name: "Chat with Kingsley Chukwudi (minimised)" });
    expect(screen.queryByLabelText("Write a message to Kingsley Chukwudi")).toBeNull();

    fireEvent.click(within(bar).getByRole("button", { name: "Open chat with Kingsley Chukwudi" }));
    const again = await screen.findByRole("region", { name: "Chat with Kingsley Chukwudi" });

    fireEvent.click(within(again).getByRole("button", { name: "Close chat" }));
    expect(screen.queryByRole("region", { name: /Chat with Kingsley Chukwudi/ })).toBeNull();
  });

  it("keeps the thread when minimised and expanded again (no second fetch)", async () => {
    vi.mocked(getMessages).mockResolvedValue({ items: [message({ contentText: "kept" })], nextCursor: null });
    const chat = await openFirstChat();
    await within(chat).findByText("kept");
    fireEvent.click(within(chat).getByRole("button", { name: "Minimise chat" }));
    fireEvent.click(await screen.findByRole("button", { name: "Open chat with Kingsley Chukwudi" }));
    expect(await screen.findByText("kept")).toBeTruthy();
    expect(vi.mocked(getMessages)).toHaveBeenCalledTimes(1);
  });

  it("opening a second chat minimises the first; opening a third closes the oldest", async () => {
    const third = conversation({ id: "c3", otherParticipant: { id: "u4", publicName: "Third Person" } });
    vi.mocked(listConversations).mockResolvedValue({ items: [conversation(), unreadConversation, third], nextCursor: null });
    renderDock();

    fireEvent.click((await screen.findByText("Kingsley Chukwudi")).closest("button") as HTMLElement);
    await screen.findByRole("region", { name: "Chat with Kingsley Chukwudi" });

    fireEvent.click(screen.getByText("Emeka Hassan").closest("button") as HTMLElement);
    await screen.findByRole("region", { name: "Chat with Emeka Hassan" });
    expect(screen.getByRole("region", { name: "Chat with Kingsley Chukwudi (minimised)" })).toBeTruthy();

    fireEvent.click(screen.getByText("Third Person").closest("button") as HTMLElement);
    await screen.findByRole("region", { name: "Chat with Third Person" });
    // Kingsley (the oldest) is gone; Emeka is now the minimised one.
    expect(screen.queryByRole("region", { name: /Chat with Kingsley Chukwudi/ })).toBeNull();
    expect(screen.getByRole("region", { name: "Chat with Emeka Hassan (minimised)" })).toBeTruthy();
  });

  it("expanding a minimised chat minimises the other one", async () => {
    renderDock();
    fireEvent.click((await screen.findByText("Kingsley Chukwudi")).closest("button") as HTMLElement);
    await screen.findByRole("region", { name: "Chat with Kingsley Chukwudi" });
    fireEvent.click(screen.getByText("Emeka Hassan").closest("button") as HTMLElement);
    await screen.findByRole("region", { name: "Chat with Emeka Hassan" });

    fireEvent.click(screen.getByRole("button", { name: "Open chat with Kingsley Chukwudi" }));
    await screen.findByRole("region", { name: "Chat with Kingsley Chukwudi" });
    expect(screen.getByRole("region", { name: "Chat with Emeka Hassan (minimised)" })).toBeTruthy();
  });

  it("shows 'Deleted user' for a participant whose account is gone", async () => {
    vi.mocked(listConversations).mockResolvedValue({
      items: [conversation({ otherParticipant: null })],
      nextCursor: null,
    });
    renderDock();
    fireEvent.click((await screen.findByText("Deleted user")).closest("button") as HTMLElement);
    expect(await screen.findByRole("region", { name: "Chat with Deleted user" })).toBeTruthy();
  });
});
