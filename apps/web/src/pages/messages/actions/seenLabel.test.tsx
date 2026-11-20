// B-061 read receipts, the web leg: the "Seen 08:09 AM" label under YOUR latest message, on BOTH
// surfaces that show a conversation (the mobile page and the Community pop-up; Figma V1 to V4).
// The server decides who may see a read time (both people on, same age class, only on messages you
// sent) and sends `readAt` only then; these tests cover where the screen places the label.
// Mocks src/api/messaging.ts; plain DOM assertions.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import ConversationPage from "../ConversationPage";
import CommunityMessages from "../../community/messages/CommunityMessages";
import { seenLabel } from "../../community/messages/time";
import type { Conversation, DeletedMessage, Message, ThreadMessage } from "../../../api/messaging";

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

import { listConversations, getMessages, sendMessage, markConversationRead } from "../../../api/messaging";
import { seedSession, clearSession } from "../../../test/session";

const ME = "user-me";
const OTHER = "u2";
const MINUTE = 60_000;

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

function deletedMsg(overrides: Partial<DeletedMessage> = {}): DeletedMessage {
  return {
    id: "m-del",
    conversationId: "c1",
    senderId: ME,
    sentAt: ago(1),
    editedAt: null,
    deletedForEveryone: true,
    contentText: null,
    ...overrides,
  };
}

const READ_AT = ago(0.5);

const THEIRS_EARLY = msg({ id: "t1", senderId: OTHER, contentText: "Their first", sentAt: ago(50) });
const MINE_OLD_READ = msg({ id: "m1", senderId: ME, contentText: "My older message", sentAt: ago(40), readAt: ago(39) });
const THEIRS_MID = msg({ id: "t2", senderId: OTHER, contentText: "Their second", sentAt: ago(35) });
const MINE_LATEST_READ = msg({ id: "m2", senderId: ME, contentText: "My latest message", sentAt: ago(20), readAt: READ_AT });
const MINE_LATEST_UNREAD = msg({ id: "m3", senderId: ME, contentText: "My unread message", sentAt: ago(10), readAt: null });
const THEIRS_AFTER = msg({ id: "t3", senderId: OTHER, contentText: "Their reply after", sentAt: ago(5) });

function conversation(): Conversation {
  return {
    id: "c1",
    otherParticipant: { id: OTHER, publicName: "Matthew Amuloko" },
    lastMessageAt: ago(2),
    createdAt: ago(600),
    lastMessage: { contentText: "x", senderId: ME, sentAt: ago(2) },
    unreadCount: 0,
  };
}

// Oldest first here; the mock hands them to the page newest-first, as the API does.
function serve(items: ThreadMessage[]) {
  vi.mocked(getMessages).mockResolvedValue({ items: [...items].reverse(), nextCursor: null });
}

function setWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
}

type Surface = { name: string; open: (waitForText: string) => Promise<void> };

const mobilePage: Surface = {
  name: "mobile page",
  async open(waitForText) {
    seedSession(TOKEN);
    render(
      <MemoryRouter
        initialEntries={[{ pathname: "/messages/c1", state: { otherParticipant: { id: OTHER, publicName: "Matthew Amuloko" } } }]}
      >
        <Routes>
          <Route path="/messages/:conversationId" element={<ConversationPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText(waitForText);
  },
};

const popUp: Surface = {
  name: "Community pop-up",
  async open(waitForText) {
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
    await screen.findByText(waitForText);
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

function seenLabels(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(".msg-seen"));
}

describe.each([mobilePage, popUp])("the Seen label on the $name", (surface) => {
  it("shows under my latest message when it was read, in the drawn 'Seen 08:09 AM' form", async () => {
    serve([THEIRS_EARLY, MINE_LATEST_READ]);
    await surface.open("My latest message");

    const labels = seenLabels();
    expect(labels).toHaveLength(1);
    expect(labels[0].textContent).toMatch(/^Seen \d{2}:\d{2} (AM|PM)$/);
    expect(labels[0].textContent).toBe(seenLabel(READ_AT));
    // It sits directly after the bubble of that message.
    expect(labels[0].previousElementSibling?.textContent).toContain("My latest message");
  });

  it("is the read time of THAT message, not the sent time", async () => {
    const sent = "2026-11-08T08:06:00.000Z";
    const read = "2026-11-08T08:09:00.000Z";
    serve([msg({ id: "m2", senderId: ME, contentText: "Timed message", sentAt: sent, readAt: read })]);
    await surface.open("Timed message");
    expect(seenLabels()[0].textContent).toBe(seenLabel(read));
    expect(seenLabels()[0].textContent).not.toBe(seenLabel(sent));
  });

  it("is only under the LATEST message of mine, never an older one that was also read", async () => {
    serve([THEIRS_EARLY, MINE_OLD_READ, THEIRS_MID, MINE_LATEST_READ]);
    await surface.open("My latest message");

    const labels = seenLabels();
    expect(labels).toHaveLength(1);
    expect(labels[0].previousElementSibling?.textContent).toContain("My latest message");
    expect(labels[0].previousElementSibling?.textContent).not.toContain("My older message");
  });

  it("is not shown when my latest message has not been read, even if an older one was", async () => {
    serve([THEIRS_EARLY, MINE_OLD_READ, THEIRS_MID, MINE_LATEST_UNREAD]);
    await surface.open("My unread message");
    expect(seenLabels()).toHaveLength(0);
    expect(screen.queryByText(/^Seen /)).toBeNull();
  });

  it("is never under a message I received, even if a read time somehow arrives on it", async () => {
    serve([msg({ id: "t9", senderId: OTHER, contentText: "Their only message", readAt: READ_AT })]);
    await surface.open("Their only message");
    expect(seenLabels()).toHaveLength(0);
  });

  it("stays under my message when they reply after it (the frame keeps it)", async () => {
    serve([THEIRS_EARLY, MINE_LATEST_READ, THEIRS_AFTER]);
    await surface.open("Their reply after");

    const labels = seenLabels();
    expect(labels).toHaveLength(1);
    expect(labels[0].previousElementSibling?.textContent).toContain("My latest message");
  });

  it("is not shown on a 'This message was deleted' placeholder, nor under an earlier message of mine", async () => {
    serve([THEIRS_EARLY, MINE_OLD_READ, THEIRS_MID, deletedMsg({ id: "m-del", sentAt: ago(15) })]);
    await surface.open("My older message");

    expect(screen.getByText("This message was deleted")).toBeTruthy();
    expect(seenLabels()).toHaveLength(0);
  });

  it("is not shown when the thread has no message of mine", async () => {
    serve([THEIRS_EARLY, THEIRS_MID]);
    await surface.open("Their second");
    expect(seenLabels()).toHaveLength(0);
  });

  it("does not hide or collide with the Edited line: both show, in separate elements", async () => {
    serve([THEIRS_EARLY, { ...MINE_LATEST_READ, editedAt: ago(15) }]);
    await surface.open("My latest message");

    const host = screen.getByText("My latest message").closest(".msg-host") as HTMLElement;
    expect(host.textContent).toMatch(/Edited/);
    const label = seenLabels()[0];
    expect(label).toBeTruthy();
    expect(host.contains(label)).toBe(false);
    expect(label.previousElementSibling?.textContent).toContain("My latest message");
  });

  it("goes away from the old message when I send a new one (a fresh message is unread)", async () => {
    serve([THEIRS_EARLY, MINE_LATEST_READ]);
    vi.mocked(sendMessage).mockResolvedValue(
      msg({ id: "m-new", senderId: ME, contentText: "Brand new", sentAt: new Date().toISOString(), readAt: null }),
    );
    await surface.open("My latest message");
    expect(seenLabels()).toHaveLength(1);

    const input = screen.getByLabelText(/Write a message/i);
    fireEvent.change(input, { target: { value: "Brand new" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Brand new");
    await waitFor(() => expect(seenLabels()).toHaveLength(0));
  });

  it("adds no polling: the thread is requested once", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      serve([THEIRS_EARLY, MINE_LATEST_READ]);
      await surface.open("My latest message");
      const calls = vi.mocked(getMessages).mock.calls.length;
      vi.advanceTimersByTime(5 * 60_000);
      expect(vi.mocked(getMessages).mock.calls.length).toBe(calls);
    } finally {
      vi.useRealTimers();
    }
  });
});
