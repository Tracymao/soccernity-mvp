// Plain DOM assertions, mocks src/api/messaging.ts + src/api/users.ts,
// session seeded into sessionStorage. GET /users/:id/following and
// POST /conversations are real merged endpoints -- exercising them live
// is services/api's e2e layer's job.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import NewConversationPage from "./NewConversationPage";
import { MessagingApiError } from "../../api/messaging";
import type { FollowUserSummary } from "../../api/users";

vi.mock("../../api/messaging", async () => {
  const actual = await vi.importActual<typeof import("../../api/messaging")>("../../api/messaging");
  return { ...actual, startConversation: vi.fn() };
});

vi.mock("../../api/users", async () => {
  const actual = await vi.importActual<typeof import("../../api/users")>("../../api/users");
  return { ...actual, getFollowing: vi.fn() };
});

import { startConversation } from "../../api/messaging";
import { getFollowing } from "../../api/users";

function base64UrlEncode(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fakeAccessToken(sub = "user-1"): string {
  return `${base64UrlEncode({ alg: "none" })}.${base64UrlEncode({ sub, role: "fan" })}.sig`;
}

function person(overrides: Partial<FollowUserSummary> = {}): FollowUserSummary {
  return { id: "user-2", displayName: "Ada Obi", ...overrides };
}

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(startConversation).mockReset();
  vi.mocked(getFollowing).mockReset();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/messages/new"]}>
      <Routes>
        <Route path="/messages/new" element={<NewConversationPage />} />
        <Route path="/messages/:conversationId" element={<div data-testid="thread">thread</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("NewConversationPage", () => {
  it("shows a log-in prompt and never calls GET /users/:id/following with no session", () => {
    renderPage();
    expect(screen.getByText(/log in to message people/i)).not.toBeNull();
    expect(getFollowing).not.toHaveBeenCalled();
  });

  it("renders the caller's real follow list as the default recipient list", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getFollowing).mockResolvedValueOnce({ items: [person()], nextCursor: null });

    renderPage();

    expect(await screen.findByText("Ada Obi")).not.toBeNull();
    expect(getFollowing).toHaveBeenCalledWith(expect.any(String), "user-1");
  });

  it("filters the loaded follow list client-side by search term (no people-search endpoint exists)", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getFollowing).mockResolvedValueOnce({
      items: [person(), person({ id: "user-3", displayName: "Bola Ade" })],
      nextCursor: null,
    });

    renderPage();
    await screen.findByText("Ada Obi");

    fireEvent.change(screen.getByLabelText(/search people you follow/i), { target: { value: "bola" } });

    expect(screen.queryByText("Ada Obi")).toBeNull();
    expect(screen.getByText("Bola Ade")).not.toBeNull();
    // No re-fetch -- purely a client-side filter over what's already loaded.
    expect(getFollowing).toHaveBeenCalledTimes(1);
  });

  it("starts a conversation via the real POST /conversations and navigates to the thread", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getFollowing).mockResolvedValueOnce({ items: [person()], nextCursor: null });
    vi.mocked(startConversation).mockResolvedValueOnce({
      created: true,
      conversation: {
        id: "convo-1",
        otherParticipant: { id: "user-2", displayName: "Ada Obi" },
        lastMessageAt: "2026-09-13T00:00:00.000Z",
        createdAt: "2026-09-13T00:00:00.000Z",
        lastMessage: null,
        unreadCount: 0,
      },
    });

    renderPage();
    await screen.findByText("Ada Obi");

    fireEvent.click(screen.getByRole("button", { name: "Message" }));

    await waitFor(() => expect(startConversation).toHaveBeenCalledWith(expect.any(String), "user-2"));
    expect(await screen.findByTestId("thread")).not.toBeNull();
  });

  it("shows the server's own error message (e.g. a restricted-pending 404) rather than a generic failure", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getFollowing).mockResolvedValueOnce({ items: [person()], nextCursor: null });
    vi.mocked(startConversation).mockRejectedValueOnce(new MessagingApiError("User not found", { status: 404 }));

    renderPage();
    await screen.findByText("Ada Obi");

    fireEvent.click(screen.getByRole("button", { name: "Message" }));

    expect(await screen.findByText("User not found")).not.toBeNull();
  });
});
