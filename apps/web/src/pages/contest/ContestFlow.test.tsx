// Full contest-posting flow across the seam between pages:
//   submit a contest entry on Community  ->  it appears on the Contest page
//   as the caller's own entry            ->  once judged it appears on the
//   Leaderboard's Contest tab as a weekly winner.
//
// api/feed, api/contest and api/users are mocked; the same created post id
// is threaded through every step so the "it shows up over there" claim is
// genuinely tested, not just asserted per-page in isolation.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import CommunityPage from "../CommunityPage";
import ContestPage from "../ContestPage";
import LeaderboardPage from "../LeaderboardPage";
import type { CurrentContestResponse } from "../../api/contest";
import type { FeedPost } from "../../api/feed";

vi.mock("../../api/feed", async () => {
  const actual = await vi.importActual<typeof import("../../api/feed")>("../../api/feed");
  return { ...actual, getFeed: vi.fn(), createPost: vi.fn() };
});
vi.mock("../../api/users", async () => {
  const actual = await vi.importActual<typeof import("../../api/users")>("../../api/users");
  return { ...actual, getUser: vi.fn() };
});
vi.mock("../../api/contest", async () => {
  const actual = await vi.importActual<typeof import("../../api/contest")>("../../api/contest");
  return { ...actual, getCurrentContest: vi.fn(), submitContestEntry: vi.fn() };
});
vi.mock("../../api/clubs", async () => {
  const actual = await vi.importActual<typeof import("../../api/clubs")>("../../api/clubs");
  return { ...actual, listClubs: vi.fn() };
});

import { getFeed, createPost } from "../../api/feed";
import { getUser } from "../../api/users";
import { getCurrentContest, submitContestEntry } from "../../api/contest";
import { listClubs } from "../../api/clubs";

function b64(v: object): string {
  return btoa(JSON.stringify(v)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const TOKEN = `${b64({ alg: "none" })}.${b64({ sub: "user-1", role: "fan" })}.sig`;

function openContest(overrides: Partial<CurrentContestResponse> = {}): CurrentContestResponse {
  return {
    cycle: {
      id: "cycle-1",
      title: "September Contest",
      status: "active",
      startsAt: new Date().toISOString(),
      endsAt: new Date().toISOString(),
      finalOpenedAt: null,
      crownedAt: null,
    },
    phase: "week_1",
    isAcceptingEntries: true,
    activeRound: {
      id: "round-2",
      weekNumber: 2,
      status: "open",
      opensAt: new Date().toISOString(),
      closesAt: new Date(Date.now() + 86400000).toISOString(),
      judgedAt: null,
    },
    rounds: [],
    weeklyWinners: [],
    monthlyStandings: [],
    callerEntry: null,
    ...overrides,
  };
}

function feedPost(): FeedPost {
  return {
    id: "my-entry-post",
    authorId: "user-1",
    author: { id: "user-1", displayName: "Ada Player", isFollowing: false },
    contentText: "Nutmeg challenge — week 2",
    mediaUrls: [],
    clubPageId: null,
    banterRoomId: null,
    likeCount: 0,
    commentCount: 0,
    createdAt: new Date().toISOString(),
    isLiked: false,
    isSaved: false,
  };
}

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.sessionStorage.setItem("sn_access_token", TOKEN);
  vi.mocked(getFeed).mockReset().mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(getUser).mockReset().mockResolvedValue({ displayName: "Ada Player" } as never);
  vi.mocked(listClubs).mockReset().mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(createPost).mockReset();
  vi.mocked(getCurrentContest).mockReset();
  vi.mocked(submitContestEntry).mockReset();
});

describe("contest posting flow", () => {
  it("submission -> Contest page -> Leaderboard Contest tab, threading one post id", async () => {
    // --- step 1: submit an entry from the Community composer -------------
    vi.mocked(getCurrentContest).mockResolvedValue(openContest());
    vi.mocked(createPost).mockResolvedValueOnce(feedPost() as never);
    vi.mocked(submitContestEntry).mockResolvedValueOnce({
      id: "ce-1",
      cycleId: "cycle-1",
      roundId: "round-2",
      weekNumber: 2,
      postId: "my-entry-post",
      submittedAt: new Date().toISOString(),
    });

    const community = render(
      <MemoryRouter initialEntries={["/community?compose=contest"]}>
        <CommunityPage />
      </MemoryRouter>,
    );
    await screen.findByText(/your feed is quiet/i);

    // GET /contest/current resolves after the feed; wait for contest mode.
    fireEvent.change(await screen.findByLabelText(/caption for your contest entry/i), {
      target: { value: "Nutmeg challenge — week 2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit entry/i }));

    await waitFor(() => expect(createPost).toHaveBeenCalled());
    const createdPostId = vi.mocked(submitContestEntry).mock.calls[0][1];
    expect(createdPostId).toBe("my-entry-post");
    community.unmount();

    // --- step 2: that entry now shows on the Contest page ---------------
    vi.mocked(getCurrentContest).mockResolvedValue(
      openContest({ callerEntry: { roundId: "round-2", weekNumber: 2, postId: createdPostId } }),
    );
    const contest = render(
      <MemoryRouter initialEntries={["/contest"]}>
        <ContestPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/your entry for week 2 is in/i)).not.toBeNull();
    contest.unmount();

    // --- step 3: once judged, the entry's author is a weekly winner on
    //     the Leaderboard Contest tab ------------------------------------
    vi.mocked(getCurrentContest).mockResolvedValue(
      openContest({
        phase: "weeks_1_2",
        weeklyWinners: [
          {
            weekNumber: 2,
            position: 1,
            userId: "user-1",
            displayName: "Ada Player",
            entryId: "ce-1",
            postId: createdPostId,
          },
        ],
      }),
    );
    render(
      <MemoryRouter initialEntries={["/leaderboard?tab=contest"]}>
        <LeaderboardPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Ada Player")).not.toBeNull();
    expect(screen.getByRole("tab", { name: "Contest" }).getAttribute("aria-selected")).toBe("true");
  });
});
