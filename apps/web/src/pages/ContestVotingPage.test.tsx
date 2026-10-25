// Contest Voting page (B-098): the one-vote toggle, live counts, the server's coded refusals.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import ContestVotingPage from "./ContestVotingPage";
import { ContestApiError, type ContestEntryView, type ContestRoundEntriesResponse } from "../api/contest";
import { openContest, roundSummary } from "./contest/contestFixtures";

vi.mock("../api/contest", async () => {
  const actual = await vi.importActual<typeof import("../api/contest")>("../api/contest");
  return { ...actual, getCurrentContest: vi.fn(), getRoundEntries: vi.fn(), castVote: vi.fn(), retractVote: vi.fn() };
});
import { getCurrentContest, getRoundEntries, castVote, retractVote } from "../api/contest";

function b64(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const TOKEN = `${b64({ alg: "none" })}.${b64({ sub: "me", role: "fan" })}.sig`;

function entry(id: string, name: string, over: Partial<ContestEntryView> = {}): ContestEntryView {
  return {
    entryId: id,
    roundId: "round-2",
    weekNumber: 2,
    kind: "weekly",
    entrant: { userId: `u-${id}`, publicName: name },
    post: { id: `p-${id}`, contentText: `${name}'s trick`, mediaUrls: [], createdAt: "2026-09-09T10:00:00.000Z", likeCount: 0, commentCount: 0 },
    submittedAt: "2026-09-09T10:00:00.000Z",
    qualified: true,
    phase1Rank: 1,
    voteCount: 4,
    votedByCaller: false,
    position: null,
    pinned: false,
    ...over,
  };
}

function entriesPage(items: ContestEntryView[], nextCursor: string | null = null): ContestRoundEntriesResponse {
  return { round: roundSummary(2), calendarState: null, items, nextCursor, callerVote: null };
}

const VOTING = { kind: "week_voting", weekNumber: 2, locksAt: "2026-09-14T19:00:00.000Z" } as const;

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.sessionStorage.setItem("sn_access_token", TOKEN);
  vi.mocked(getCurrentContest).mockReset().mockResolvedValue(openContest({ calendarState: VOTING }));
  vi.mocked(getRoundEntries).mockReset().mockResolvedValue(entriesPage([entry("e1", "Chuks"), entry("e2", "Ada")]));
  vi.mocked(castVote).mockReset();
  vi.mocked(retractVote).mockReset();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/contest/voting"]}>
      <ContestVotingPage />
    </MemoryRouter>,
  );
}

describe("ContestVotingPage", () => {
  it("prompts to log in and calls nothing with no session", () => {
    window.sessionStorage.clear();
    renderPage();
    expect(screen.getByText(/log in to vote/i)).not.toBeNull();
    expect(getCurrentContest).not.toHaveBeenCalled();
  });

  it("when voting is not open it says so and fetches no entries", async () => {
    vi.mocked(getCurrentContest).mockResolvedValue(openContest());
    renderPage();
    await screen.findByText(/voting isn.t open right now/i);
    expect(getRoundEntries).not.toHaveBeenCalled();
  });

  it("lists the entries with a Vote toggle and a live count each", async () => {
    renderPage();
    await screen.findByText("Chuks");
    expect(screen.getAllByText("4 Votes")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Vote for Chuks" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("voting flips the toggle to Voted and updates the count by one, with no banner", async () => {
    vi.mocked(castVote).mockResolvedValue({ roundId: "round-2", entryId: "e1", voted: true, voteCount: 5, callerVote: "e1" });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Vote for Chuks" }));
    const voted = await screen.findByRole("button", { name: "Remove your vote for Chuks" });
    expect(voted.getAttribute("aria-pressed")).toBe("true");
    expect(voted.textContent).toBe("Voted");
    expect(screen.getByText("5 Votes")).not.toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("clicking Voted again removes the vote (the same single control)", async () => {
    vi.mocked(getRoundEntries).mockResolvedValue(entriesPage([entry("e1", "Chuks", { votedByCaller: true, voteCount: 5 })]));
    vi.mocked(retractVote).mockResolvedValue({ roundId: "round-2", entryId: "e1", voted: false, voteCount: 4, callerVote: null });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Remove your vote for Chuks" }));
    await screen.findByRole("button", { name: "Vote for Chuks" });
    expect(retractVote).toHaveBeenCalledWith(expect.any(String), "e1");
    expect(screen.getByText("4 Votes")).not.toBeNull();
  });

  it("a second vote while one is held shows the server's own message under that entry", async () => {
    vi.mocked(castVote).mockRejectedValue(
      new ContestApiError("Un-vote first to vote for someone else.", { status: 409, code: "contest_already_voted" }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Vote for Ada" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Un-vote first to vote for someone else.");
    expect(screen.getByRole("button", { name: "Vote for Ada" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("a restricted account's coded 403 is shown as the server's message", async () => {
    vi.mocked(castVote).mockRejectedValue(
      new ContestApiError("Your account needs guardian approval.", { status: 403, code: "guardian_consent_pending" }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Vote for Chuks" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Your account needs guardian approval.");
  });

  it("Load more appends the next page by cursor", async () => {
    vi.mocked(getRoundEntries)
      .mockResolvedValueOnce(entriesPage([entry("e1", "Chuks")], "c1"))
      .mockResolvedValueOnce(entriesPage([entry("e3", "Femi")]));
    renderPage();
    await screen.findByText("Chuks");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Femi");
    await waitFor(() => expect(getRoundEntries).toHaveBeenLastCalledWith(expect.any(String), "round-2", "c1"));
  });

  it("an entrant name opens their profile", async () => {
    renderPage();
    expect((await screen.findByRole("link", { name: "Chuks" })).getAttribute("href")).toBe("/users/u-e1");
  });

  it("shows the forfeit pop-up on load", async () => {
    vi.mocked(getCurrentContest).mockResolvedValue(
      openContest({ calendarState: VOTING, forfeitedWeeks: [{ weekNumber: 1, reason: "Fewer than three entries." }] }),
    );
    renderPage();
    await screen.findByRole("alertdialog");
  });
});
