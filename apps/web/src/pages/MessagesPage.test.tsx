// Plain DOM assertions, mocks src/api/messaging.ts, session seeded into
// sessionStorage. GET /conversations is a real merged endpoint
// (sprint-3/messaging-direct-messaging) -- exercising it live is
// services/api's e2e layer's job.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import MessagesPage from "./MessagesPage";
import type { Conversation } from "../api/messaging";

vi.mock("../api/messaging", async () => {
  const actual = await vi.importActual<typeof import("../api/messaging")>("../api/messaging");
  return { ...actual, listConversations: vi.fn() };
});

import { listConversations } from "../api/messaging";

function base64UrlEncode(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fakeAccessToken(sub = "user-1"): string {
  return `${base64UrlEncode({ alg: "none" })}.${base64UrlEncode({ sub, role: "fan" })}.sig`;
}

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "convo-1",
    otherParticipant: { id: "user-2", displayName: "Ada Obi" },
    lastMessageAt: "2026-09-13T10:00:00.000Z",
    createdAt: "2026-09-01T00:00:00.000Z",
    lastMessage: { contentText: "See you at training", senderId: "user-2", sentAt: "2026-09-13T10:00:00.000Z" },
    unreadCount: 0,
    ...overrides,
  };
}

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(listConversations).mockReset();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/messages"]}>
      <MessagesPage />
    </MemoryRouter>,
  );
}

describe("MessagesPage", () => {
  it("shows a log-in prompt and never calls GET /conversations with no session", () => {
    renderPage();
    expect(screen.getByText(/log in to see your messages/i)).not.toBeNull();
    expect(listConversations).not.toHaveBeenCalled();
  });

  it("renders the real inbox, including the other participant's name, preview and an unread badge", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(listConversations).mockResolvedValueOnce({
      items: [conversation({ unreadCount: 3 })],
      nextCursor: null,
    });

    renderPage();

    expect(await screen.findByText("Ada Obi")).not.toBeNull();
    expect(screen.getByText("See you at training")).not.toBeNull();
    expect(screen.getByLabelText("3 unread")).not.toBeNull();
  });

  it("renders the empty-inbox state with a Start a conversation link", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(listConversations).mockResolvedValueOnce({ items: [], nextCursor: null });

    renderPage();

    expect(await screen.findByText(/you don.t have any messages yet/i)).not.toBeNull();
    expect(screen.getByRole("link", { name: "Start a conversation" }).getAttribute("href")).toBe("/messages/new");
  });

  it("renders 'Deleted user' for a conversation whose other participant was hard-deleted (Decision Log #44)", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(listConversations).mockResolvedValueOnce({
      items: [conversation({ otherParticipant: { id: "user-2", displayName: null }, lastMessage: null })],
      nextCursor: null,
    });

    renderPage();

    expect(await screen.findByText("Deleted user")).not.toBeNull();
    expect(screen.getByText(/no messages yet/i)).not.toBeNull();
  });

  it("carries the conversation's otherParticipant as router state on the row link", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(listConversations).mockResolvedValueOnce({ items: [conversation()], nextCursor: null });

    renderPage();

    const link = await screen.findByText("Ada Obi");
    expect(link.closest("a")?.getAttribute("href")).toBe("/messages/convo-1");
  });

  it("fetches the next page with the returned cursor when Load more is clicked", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(listConversations)
      .mockResolvedValueOnce({ items: [conversation()], nextCursor: "cursor-1" })
      .mockResolvedValueOnce({
        items: [conversation({ id: "convo-2", otherParticipant: { id: "user-3", displayName: "Bola" } })],
        nextCursor: null,
      });

    renderPage();
    await screen.findByText("Ada Obi");

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByText("Bola")).not.toBeNull();
    expect(listConversations).toHaveBeenLastCalledWith(expect.any(String), "cursor-1");
  });
});
