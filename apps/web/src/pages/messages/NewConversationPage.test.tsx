// Plain DOM assertions, mocks src/api/search.ts + src/api/messaging.ts,
// session seeded into sessionStorage. GET /search?scope=users and
// POST /conversations are real merged endpoints -- exercising them live
// is services/api's e2e layer's job.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import NewConversationPage from "./NewConversationPage";
import { MessagingApiError } from "../../api/messaging";
import { SearchApiError, type SearchUserResult } from "../../api/search";

vi.mock("../../api/messaging", async () => {
  const actual = await vi.importActual<typeof import("../../api/messaging")>("../../api/messaging");
  return { ...actual, startConversation: vi.fn() };
});

vi.mock("../../api/search", async () => {
  const actual = await vi.importActual<typeof import("../../api/search")>("../../api/search");
  return { ...actual, searchUsers: vi.fn() };
});

import { startConversation } from "../../api/messaging";
import { searchUsers } from "../../api/search";

function base64UrlEncode(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fakeAccessToken(sub = "user-1"): string {
  return `${base64UrlEncode({ alg: "none" })}.${base64UrlEncode({ sub, role: "fan" })}.sig`;
}

function person(overrides: Partial<SearchUserResult> = {}): SearchUserResult {
  return { id: "user-2", displayName: "Ada Obi", ...overrides };
}

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(startConversation).mockReset();
  vi.mocked(searchUsers).mockReset();
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
  it("shows a log-in prompt and never calls GET /search with no session", () => {
    renderPage();
    expect(screen.getByText(/log in to message people/i)).not.toBeNull();
    expect(searchUsers).not.toHaveBeenCalled();
  });

  it("shows a search prompt and calls nothing before a query is typed", () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    renderPage();

    expect(screen.getByText(/search for someone to message/i)).not.toBeNull();
    expect(searchUsers).not.toHaveBeenCalled();
  });

  it("does not call GET /search for a query under 2 trimmed characters", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    renderPage();

    fireEvent.change(screen.getByLabelText(/search people/i), { target: { value: " a " } });

    await new Promise((r) => setTimeout(r, 350));
    expect(searchUsers).not.toHaveBeenCalled();
  });

  it("debounces (300ms) then calls the real GET /search?scope=users and renders the results", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(searchUsers).mockResolvedValueOnce({ items: [person()], nextCursor: null });

    renderPage();
    fireEvent.change(screen.getByLabelText(/search people/i), { target: { value: "ada" } });

    await waitFor(() => expect(searchUsers).toHaveBeenCalledWith("ada"));
    expect(await screen.findByText("Ada Obi")).not.toBeNull();
  });

  it("shows a 'no one matches' message when the search returns nothing", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(searchUsers).mockResolvedValueOnce({ items: [], nextCursor: null });

    renderPage();
    fireEvent.change(screen.getByLabelText(/search people/i), { target: { value: "zzzzz" } });

    expect(await screen.findByText(/no one matches/i)).not.toBeNull();
  });

  it("fetches the next page with the returned cursor when Load more is clicked", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(searchUsers).mockResolvedValueOnce({ items: [person()], nextCursor: "cursor-1" });
    vi.mocked(searchUsers).mockResolvedValueOnce({ items: [person({ id: "user-3", displayName: "Bola Ade" })], nextCursor: null });

    renderPage();
    fireEvent.change(screen.getByLabelText(/search people/i), { target: { value: "ada" } });
    await screen.findByText("Ada Obi");

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    await waitFor(() => expect(searchUsers).toHaveBeenCalledWith("ada", "cursor-1"));
    expect(await screen.findByText("Bola Ade")).not.toBeNull();
  });

  it("starts a conversation via the real POST /conversations and navigates to the thread", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(searchUsers).mockResolvedValueOnce({ items: [person()], nextCursor: null });
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
    fireEvent.change(screen.getByLabelText(/search people/i), { target: { value: "ada" } });
    await screen.findByText("Ada Obi");

    fireEvent.click(screen.getByRole("button", { name: "Message" }));

    await waitFor(() => expect(startConversation).toHaveBeenCalledWith(expect.any(String), "user-2"));
    expect(await screen.findByTestId("thread")).not.toBeNull();
  });

  it("shows the server's own error message (e.g. a restricted-pending 404) rather than a generic failure", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(searchUsers).mockResolvedValueOnce({ items: [person()], nextCursor: null });
    vi.mocked(startConversation).mockRejectedValueOnce(new MessagingApiError("User not found", { status: 404 }));

    renderPage();
    fireEvent.change(screen.getByLabelText(/search people/i), { target: { value: "ada" } });
    await screen.findByText("Ada Obi");

    fireEvent.click(screen.getByRole("button", { name: "Message" }));

    expect(await screen.findByText("User not found")).not.toBeNull();
  });

  it("shows the server's own search error message rather than a generic failure", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(searchUsers).mockRejectedValueOnce(new SearchApiError("q must be at least 2 characters", { status: 400 }));

    renderPage();
    fireEvent.change(screen.getByLabelText(/search people/i), { target: { value: "ok" } });

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/q must be at least 2 characters/i);
  });
});
