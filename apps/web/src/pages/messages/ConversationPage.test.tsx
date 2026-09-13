// Plain DOM assertions, mocks src/api/messaging.ts, session seeded into
// sessionStorage. GET/POST /conversations/:id/messages and
// PATCH /conversations/:id/read are real merged endpoints
// (sprint-3/messaging-direct-messaging + sprint-3/banter-messaging-to-
// code's markConversationRead fix) -- exercising them live is services/
// api's e2e layer's job.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import ConversationPage from "./ConversationPage";
import { MessagingApiError, type Message } from "../../api/messaging";

vi.mock("../../api/messaging", async () => {
  const actual = await vi.importActual<typeof import("../../api/messaging")>("../../api/messaging");
  return {
    ...actual,
    getMessages: vi.fn(),
    sendMessage: vi.fn(),
    markConversationRead: vi.fn(),
  };
});

import { getMessages, sendMessage, markConversationRead } from "../../api/messaging";

function base64UrlEncode(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fakeAccessToken(sub = "user-1"): string {
  return `${base64UrlEncode({ alg: "none" })}.${base64UrlEncode({ sub, role: "fan" })}.sig`;
}

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: "m-1",
    conversationId: "convo-1",
    senderId: "user-2",
    contentText: "Hey!",
    mediaUrl: null,
    sentAt: "2026-09-13T10:00:00.000Z",
    readAt: null,
    ...overrides,
  };
}

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(getMessages).mockReset();
  vi.mocked(sendMessage).mockReset();
  vi.mocked(markConversationRead).mockReset().mockResolvedValue({ conversationId: "convo-1", markedRead: 0 });
});

function renderPage(state?: { otherParticipant: { id: string; displayName: string | null } }) {
  render(
    <MemoryRouter initialEntries={[{ pathname: "/messages/convo-1", state }]}>
      <Routes>
        <Route path="/messages/:conversationId" element={<ConversationPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ConversationPage", () => {
  it("shows a log-in prompt and never calls GET /conversations/:id/messages with no session", () => {
    renderPage();
    expect(screen.getByText(/log in to view this conversation/i)).not.toBeNull();
    expect(getMessages).not.toHaveBeenCalled();
  });

  it("renders the header name from router state, and messages oldest-first even though the API returns newest-first", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    // GET /conversations/:id/messages returns newest-first (sentAt desc).
    vi.mocked(getMessages).mockResolvedValueOnce({
      items: [
        message({ id: "m-2", contentText: "Second", sentAt: "2026-09-13T10:05:00.000Z" }),
        message({ id: "m-1", contentText: "First", sentAt: "2026-09-13T10:00:00.000Z" }),
      ],
      nextCursor: null,
    });

    renderPage({ otherParticipant: { id: "user-2", displayName: "Ada Obi" } });

    expect(await screen.findByRole("heading", { name: "Ada Obi" })).not.toBeNull();
    const bubbles = await screen.findAllByText(/first|second/i);
    expect(bubbles[0].textContent).toBe("First");
    expect(bubbles[1].textContent).toBe("Second");
  });

  it("falls back to a generic 'Conversation' header with no router state (a direct visit)", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getMessages).mockResolvedValueOnce({ items: [], nextCursor: null });

    renderPage();

    expect(await screen.findByRole("heading", { name: "Conversation" })).not.toBeNull();
  });

  it("renders an honest 'Conversation not found' state on a 404", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getMessages).mockRejectedValueOnce(new MessagingApiError("not found", { status: 404 }));

    renderPage();

    expect(await screen.findByText(/conversation not found/i)).not.toBeNull();
  });

  it("marks the conversation read exactly once after the thread loads (closing the collapsed-notification gap)", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getMessages).mockResolvedValueOnce({ items: [message()], nextCursor: null });

    renderPage({ otherParticipant: { id: "user-2", displayName: "Ada Obi" } });
    await screen.findByText("Hey!");

    await waitFor(() => expect(markConversationRead).toHaveBeenCalledWith(expect.any(String), "convo-1"));
    expect(markConversationRead).toHaveBeenCalledTimes(1);
  });

  it("sends a message via the real POST endpoint and appends it to the thread", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getMessages).mockResolvedValueOnce({ items: [], nextCursor: null });
    vi.mocked(sendMessage).mockResolvedValueOnce(
      message({ id: "m-3", senderId: "user-1", contentText: "On my way" }),
    );

    renderPage({ otherParticipant: { id: "user-2", displayName: "Ada Obi" } });
    await screen.findByRole("heading", { name: "Ada Obi" });

    fireEvent.change(screen.getByLabelText("Write a message"), { target: { value: "On my way" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith(expect.any(String), "convo-1", { contentText: "On my way" }),
    );
    expect(await screen.findByText("On my way")).not.toBeNull();
  });

  it("surfaces a guardian-consent 403 with a link to /guardian-consent, not a generic failure", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getMessages).mockResolvedValueOnce({ items: [], nextCursor: null });
    vi.mocked(sendMessage).mockRejectedValueOnce(
      new MessagingApiError("Your account is awaiting guardian consent", { status: 403 }),
    );

    renderPage({ otherParticipant: { id: "user-2", displayName: "Ada Obi" } });
    await screen.findByRole("heading", { name: "Ada Obi" });

    fireEvent.change(screen.getByLabelText("Write a message"), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText(/awaiting guardian consent/i)).not.toBeNull();
    expect(screen.getByRole("link", { name: "Check your status" }).getAttribute("href")).toBe("/guardian-consent");
  });

  it("loads earlier messages and prepends them, keeping ascending order", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getMessages)
      .mockResolvedValueOnce({
        items: [message({ id: "m-2", contentText: "Recent", sentAt: "2026-09-13T10:05:00.000Z" })],
        nextCursor: "older-cursor",
      })
      .mockResolvedValueOnce({
        items: [message({ id: "m-1", contentText: "Older", sentAt: "2026-09-13T09:00:00.000Z" })],
        nextCursor: null,
      });

    renderPage({ otherParticipant: { id: "user-2", displayName: "Ada Obi" } });
    await screen.findByText("Recent");

    fireEvent.click(screen.getByRole("button", { name: "Load earlier messages" }));

    await waitFor(() => expect(getMessages).toHaveBeenCalledWith(expect.any(String), "convo-1", "older-cursor"));
    const bubbles = await screen.findAllByText(/older|recent/i);
    expect(bubbles[0].textContent).toBe("Older");
    expect(bubbles[1].textContent).toBe("Recent");
  });
});
