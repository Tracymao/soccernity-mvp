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
  data: { actor: { id: "actor-1", publicName: "Jane Doe" } },
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
  data: { conversationId: "convo-1", otherParticipant: { id: "other-1", publicName: "Sam" } },
};

const CONTEST_WIN: Notification = {
  id: "n-contest",
  type: "contest_win",
  read: true,
  createdAt: "2026-09-11T09:00:00.000Z",
  payloadRefId: "cyc-1",
  data: { cycle: { id: "cyc-1", title: "September Contest" } },
};

const KICKOFF_MATCH = {
  externalRef: "ext-123",
  competition: "Premier League",
  homeTeamName: "Arsenal",
  awayTeamName: "Chelsea",
  kickoffTime: "2026-10-03T15:00:00.000Z",
  status: "scheduled",
};

const MATCH_KICKOFF: Notification = {
  id: "n-kickoff",
  type: "match_kickoff",
  read: false,
  createdAt: "2026-10-03T14:00:00.000Z",
  payloadRefId: "ext-123",
  data: { match: KICKOFF_MATCH },
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

  it("renders an age_milestone notification with its real message, not the generic fallback", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listNotifications).mockResolvedValueOnce({
      items: [
        {
          id: "n-age",
          type: "age_milestone",
          read: false,
          createdAt: "2026-09-20T09:00:00.000Z",
          payloadRefId: "under_16_lifted",
          data: { milestone: "under_16_lifted" },
        },
      ],
      nextCursor: null,
      unreadCount: 1,
    });

    renderPage();

    expect(await screen.findByText(/now has access to more of Soccernity/i)).not.toBeNull();
    expect(screen.queryByText(/no longer available/i)).toBeNull();
    expect(screen.queryByText(/16|sixteen/i)).toBeNull();
  });

  it("renders a match_kickoff notification with the real fixture and links to its match-centre page", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listNotifications).mockResolvedValueOnce({
      items: [MATCH_KICKOFF],
      nextCursor: null,
      unreadCount: 1,
    });

    renderPage();

    const row = await screen.findByText(/kicks off soon/i);
    expect(row.textContent).toContain("Arsenal vs Chelsea");
    expect(row.closest("a")!.getAttribute("href")).toBe("/sports-hub/matches/ext-123");
  });

  it("falls back to the known side's name when a match_kickoff team is still TBD", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listNotifications).mockResolvedValueOnce({
      items: [
        {
          ...MATCH_KICKOFF,
          data: { match: { ...KICKOFF_MATCH, awayTeamName: null } },
        },
      ],
      nextCursor: null,
      unreadCount: 1,
    });

    renderPage();

    const row = await screen.findByText(/kicks off soon/i);
    expect(row.textContent).toContain("Arsenal");
    expect(row.textContent).not.toContain("vs");
  });

  describe("scheduled Contest events (B-123, Decision Log #404 item 16, #405 item 2)", () => {
    const base = { read: false, createdAt: "2026-10-08T08:00:00.000Z", payloadRefId: "cycle-1:2" };
    const cases: Array<[string, Notification, RegExp, string]> = [
      [
        "week opens",
        { ...base, id: "c1", type: "contest_week_opens", data: { cycle: { id: "cycle-1", title: "October" }, week: 2 } } as Notification,
        /Week 2 of the Contest is open/,
        "/contest",
      ],
      [
        "votes closing",
        { ...base, id: "c2", type: "contest_votes_closing", data: { cycle: { id: "cycle-1", title: "October" }, week: 1 } } as Notification,
        /Week 1 voting closes soon/,
        "/contest/voting",
      ],
      [
        "week result",
        { ...base, id: "c3", type: "contest_week_result", data: { cycle: { id: "cycle-1", title: "October" }, week: 3 } } as Notification,
        /Week 3 result is in/,
        "/leaderboard?tab=contest",
      ],
      [
        "finalist",
        { ...base, id: "c4", type: "contest_finalist", data: { cycle: { id: "cycle-1", title: "October" } } } as Notification,
        /You.re a finalist/,
        "/community?compose=contest",
      ],
      [
        "reveal",
        { ...base, id: "c5", type: "contest_reveal", data: { cycle: { id: "cycle-1", title: "October" } } } as Notification,
        /The final is live/,
        "/community",
      ],
      [
        "final result",
        { ...base, id: "c6", type: "contest_final_result", data: { cycle: { id: "cycle-1", title: "October" }, outcome: "winners" } } as Notification,
        /The final result is in/,
        "/leaderboard?tab=contest",
      ],
      [
        "no winner",
        { ...base, id: "c7", type: "contest_final_result", data: { cycle: { id: "cycle-1", title: "October" }, outcome: "no_winner" } } as Notification,
        /No winner this month/,
        "/leaderboard?tab=contest",
      ],
      [
        "upload reminder",
        { ...base, id: "c8", type: "contest_upload_reminder", data: { cycle: { id: "cycle-1", title: "October" } } } as Notification,
        /upload your final entry before the deadline/,
        "/community?compose=contest",
      ],
    ];

    it.each(cases)("%s: real wording and the Figma-drawn destination (never a profile)", async (_name, notification, text, href) => {
      window.sessionStorage.setItem("sn_access_token", "test-token");
      vi.mocked(listNotifications).mockResolvedValueOnce({ items: [notification], nextCursor: null, unreadCount: 1 });
      renderPage();
      await screen.findByRole("link", { name: text });
      const link = screen.getByRole("link", { name: text });
      expect(link.getAttribute("href")).toBe(href);
      expect(link.getAttribute("href")).not.toMatch(/^\/users\//);
    });
  });

  it("renders exactly the rows the server returns: like/comment rows between a blocked pair are hidden server-side (B-213) and the client neither filters nor re-adds them", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listNotifications).mockResolvedValueOnce({ items: [FOLLOW], nextCursor: null, unreadCount: 1 });
    renderPage();
    await screen.findByText(/started following you/i);
    expect(screen.queryByText(/liked your post/i)).toBeNull();
    expect(screen.queryByText(/commented on your post/i)).toBeNull();
    expect(listNotifications).toHaveBeenCalledTimes(1);
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
