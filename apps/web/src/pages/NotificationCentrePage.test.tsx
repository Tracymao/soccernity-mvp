// NotificationCentrePage. Same conventions as GrassrootsPage.test.tsx /
// ClubsPage.test.tsx: plain DOM assertions, mocks src/api/notifications.ts,
// session seeded into sessionStorage.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import NotificationCentrePage from "./NotificationCentrePage";
import type { Notification } from "../api/notifications";

vi.mock("../api/notifications", async () => {
  const actual = await vi.importActual<typeof import("../api/notifications")>("../api/notifications");
  return {
    ...actual,
    listNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
  };
});

import { listNotifications, markNotificationRead, markAllNotificationsRead } from "../api/notifications";

const FOLLOW: Notification = {
  id: "n-follow",
  type: "follow",
  read: false,
  createdAt: "2026-09-13T10:00:00.000Z",
  payloadRefId: "actor-1",
  data: { actor: { id: "actor-1", displayName: "Jane Doe" } },
};

const LIKE_NO_ACTOR: Notification = {
  id: "n-like",
  type: "like",
  read: false,
  createdAt: "2026-09-13T09:00:00.000Z",
  payloadRefId: "post-1",
  data: { post: { id: "post-1", contentText: "hello world", authorId: "me" } },
};

const MESSAGE: Notification = {
  id: "n-message",
  type: "message",
  read: true,
  createdAt: "2026-09-12T09:00:00.000Z",
  payloadRefId: "convo-1",
  data: { conversationId: "convo-1", otherParticipant: { id: "other-1", displayName: "Sam" } },
};

const CONTEST_WIN: Notification = {
  id: "n-contest",
  type: "contest_win",
  read: true,
  createdAt: "2026-09-11T09:00:00.000Z",
  payloadRefId: "cyc-1",
  data: { cycle: { id: "cyc-1", title: "September Contest" } },
};

const ORPHANED: Notification = {
  id: "n-orphan",
  type: "like",
  read: true,
  createdAt: "2026-09-10T09:00:00.000Z",
  payloadRefId: "deleted-post",
  data: null,
};

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(listNotifications).mockReset();
  vi.mocked(markNotificationRead).mockReset();
  vi.mocked(markAllNotificationsRead).mockReset();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/notifications"]}>
      <NotificationCentrePage />
    </MemoryRouter>,
  );
}

describe("NotificationCentrePage", () => {
  it("shows a log-in prompt and never calls GET /notifications with no session", () => {
    renderPage();
    expect(screen.getByText(/log in to see your notifications/i)).not.toBeNull();
    expect(listNotifications).not.toHaveBeenCalled();
  });

  it("renders the empty state with the coming-soon copy when there are no notifications", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listNotifications).mockResolvedValueOnce({ items: [], nextCursor: null, unreadCount: 0 });

    renderPage();

    expect(await screen.findByText("No notifications yet")).not.toBeNull();
    expect(
      screen.getByText(/more notification types — mentions, deeper bants and contest activity/i),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "Go to your feed" })).not.toBeNull();
  });

  it("renders a real follow notification with the actor's name", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listNotifications).mockResolvedValueOnce({ items: [FOLLOW], nextCursor: null, unreadCount: 1 });

    renderPage();

    expect(await screen.findByText(/started following you/i)).not.toBeNull();
    expect(screen.getByText("Jane Doe")).not.toBeNull();
  });

  it("renders a like notification with NO actor name — 'Someone' (the disclosed backend gap, Decision Log #290)", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listNotifications).mockResolvedValueOnce({
      items: [LIKE_NO_ACTOR],
      nextCursor: null,
      unreadCount: 1,
    });

    renderPage();

    expect(await screen.findByText(/liked your post/i)).not.toBeNull();
    expect(screen.getByText("Someone")).not.toBeNull();
  });

  it("renders a message notification with the real other participant's name and links to the conversation", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listNotifications).mockResolvedValueOnce({
      items: [MESSAGE],
      nextCursor: null,
      unreadCount: 0,
    });

    renderPage();

    const row = await screen.findByText(/sent you a message/i);
    expect(within(row.closest("a")!).getByText("Sam")).not.toBeNull();
    expect(row.closest("a")!.getAttribute("href")).toBe("/messages/convo-1");
  });

  it("renders a contest_win notification with only the cycle title — no fabricated week/position (Decision Log #290)", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listNotifications).mockResolvedValueOnce({
      items: [CONTEST_WIN],
      nextCursor: null,
      unreadCount: 0,
    });

    renderPage();

    expect(await screen.findByText(/you won a round in September Contest/i)).not.toBeNull();
  });

  it("renders a generic message for a notification whose referenced entity is gone (data: null)", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listNotifications).mockResolvedValueOnce({
      items: [ORPHANED],
      nextCursor: null,
      unreadCount: 0,
    });

    renderPage();

    expect(await screen.findByText("This notification is no longer available.")).not.toBeNull();
  });

  it("groups unread items under NEW and read items under EARLIER on the All tab", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listNotifications).mockResolvedValueOnce({
      items: [FOLLOW, MESSAGE],
      nextCursor: null,
      unreadCount: 1,
    });

    renderPage();

    await screen.findByText(/started following you/i);
    expect(screen.getByText("NEW")).not.toBeNull();
    expect(screen.getByText("EARLIER")).not.toBeNull();
  });

  it("the Unread tab shows only unread items, no group labels", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listNotifications).mockResolvedValueOnce({
      items: [FOLLOW, MESSAGE],
      nextCursor: null,
      unreadCount: 1,
    });

    renderPage();
    await screen.findByText(/started following you/i);

    fireEvent.click(screen.getByRole("button", { name: /Unread/ }));

    expect(screen.getByText(/started following you/i)).not.toBeNull();
    expect(screen.queryByText(/sent you a message/i)).toBeNull();
    expect(screen.queryByText("NEW")).toBeNull();
    expect(screen.queryByText("EARLIER")).toBeNull();
  });

  it("shows the real unread count as a badge on the Unread tab", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listNotifications).mockResolvedValueOnce({
      items: [FOLLOW],
      nextCursor: null,
      unreadCount: 5,
    });

    renderPage();

    expect(await screen.findByText("5")).not.toBeNull();
  });

  it("clicking an unread row (with no navigation target) marks it read and moves it to EARLIER", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listNotifications).mockResolvedValueOnce({
      items: [FOLLOW],
      nextCursor: null,
      unreadCount: 1,
    });
    vi.mocked(markNotificationRead).mockResolvedValueOnce({ ...FOLLOW, read: true });

    renderPage();
    const row = await screen.findByText(/started following you/i);
    fireEvent.click(row.closest("button")!);

    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith("test-token", "n-follow"));
    expect(screen.queryByText("NEW")).toBeNull();
    expect(screen.getByText("EARLIER")).not.toBeNull();
  });

  it("'Mark all as read' calls the endpoint and clears every unread row", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listNotifications).mockResolvedValueOnce({
      items: [FOLLOW, LIKE_NO_ACTOR],
      nextCursor: null,
      unreadCount: 2,
    });
    vi.mocked(markAllNotificationsRead).mockResolvedValueOnce({ markedRead: 2 });

    renderPage();
    await screen.findByText(/started following you/i);

    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));

    await waitFor(() => expect(markAllNotificationsRead).toHaveBeenCalledWith("test-token"));
    expect(screen.queryByText("NEW")).toBeNull();
  });

  it("'Mark all as read' is disabled when there is nothing unread", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listNotifications).mockResolvedValueOnce({
      items: [MESSAGE],
      nextCursor: null,
      unreadCount: 0,
    });

    renderPage();
    await screen.findByText(/sent you a message/i);

    expect(screen.getByRole("button", { name: "Mark all as read" }).hasAttribute("disabled")).toBe(true);
  });

  it("loads more notifications and appends them to the list", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listNotifications)
      .mockResolvedValueOnce({ items: [FOLLOW], nextCursor: "cursor-1", unreadCount: 1 })
      .mockResolvedValueOnce({ items: [MESSAGE], nextCursor: null, unreadCount: 1 });

    renderPage();
    await screen.findByText(/started following you/i);

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByText(/sent you a message/i)).not.toBeNull();
    expect(listNotifications).toHaveBeenLastCalledWith("test-token", "cursor-1");
  });
});
