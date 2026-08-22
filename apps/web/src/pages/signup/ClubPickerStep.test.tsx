// Second component test file in apps/web, following AgeGateStep.test.tsx's
// established pattern (Decision Log #19) -- plain DOM assertions only, no
// @testing-library/jest-dom (not a devDependency here). Mocks apps/web/src/
// api/clubs.ts rather than hitting a real network call -- GET /clubs and
// POST /clubs/:id/join are real, merged backend endpoints, but exercising
// them live is services/api's own e2e layer's job (test/clubs.e2e-spec.ts),
// not this component test's.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ClubPickerStep from "./ClubPickerStep";
import { ClubsApiError } from "../../api/clubs";
import type { ClubSummary } from "../../api/clubs";

vi.mock("../../api/clubs", async () => {
  const actual = await vi.importActual<typeof import("../../api/clubs")>("../../api/clubs");
  return {
    ...actual,
    listClubs: vi.fn(),
    joinClub: vi.fn(),
  };
});

import { listClubs, joinClub } from "../../api/clubs";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(listClubs).mockReset();
  vi.mocked(joinClub).mockReset();
});

const CLUB_A: ClubSummary = {
  id: "club-a",
  name: "Riverside FC",
  league: "Sunday League",
  country: "England",
  logoUrl: null,
  memberCount: 12,
};

const CLUB_B: ClubSummary = {
  id: "club-b",
  name: "Harbour United",
  league: null,
  country: null,
  logoUrl: null,
  memberCount: 0,
};

function renderStep(onDone = vi.fn()) {
  render(<ClubPickerStep accessToken="test-token" onDone={onDone} />);
  return { onDone };
}

describe("ClubPickerStep", () => {
  it("loads and renders clubs from GET /clubs on mount", async () => {
    vi.mocked(listClubs).mockResolvedValueOnce({ items: [CLUB_A, CLUB_B], nextCursor: null });

    renderStep();

    expect(await screen.findByText("Riverside FC")).not.toBeNull();
    expect(screen.getByText("Harbour United")).not.toBeNull();
    expect(listClubs).toHaveBeenCalledWith("test-token");
  });

  it("calls POST /clubs/:id/join with the club id when Join is clicked, and reflects the joined state", async () => {
    vi.mocked(listClubs).mockResolvedValueOnce({ items: [CLUB_A], nextCursor: null });
    vi.mocked(joinClub).mockResolvedValueOnce({ clubId: CLUB_A.id, joined: true, memberCount: 13 });

    renderStep();
    await screen.findByText("Riverside FC");

    fireEvent.click(screen.getByRole("button", { name: "Join" }));

    expect(joinClub).toHaveBeenCalledWith("test-token", CLUB_A.id);
    const joinedButton = await screen.findByRole("button", { name: "Joined" });
    expect((joinedButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows an inline error on a failed join but still allows continuing", async () => {
    vi.mocked(listClubs).mockResolvedValueOnce({ items: [CLUB_A], nextCursor: null });
    vi.mocked(joinClub).mockRejectedValueOnce(new ClubsApiError("Couldn't join that club (500)."));

    const { onDone } = renderStep();
    await screen.findByText("Riverside FC");

    fireEvent.click(screen.getByRole("button", { name: "Join" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/couldn.t join/i);
    // The join button itself is still enabled (not stuck disabled from a
    // failed attempt) and the continue/skip action always works regardless.
    expect((screen.getByRole("button", { name: "Join" }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /skip for now/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("calls onDone when skipped without joining anything", async () => {
    vi.mocked(listClubs).mockResolvedValueOnce({ items: [CLUB_A], nextCursor: null });

    const { onDone } = renderStep();
    await screen.findByText("Riverside FC");

    fireEvent.click(screen.getByRole("button", { name: /skip for now/i }));

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(joinClub).not.toHaveBeenCalled();
  });

  it("relabels the continue action once a club has been joined", async () => {
    vi.mocked(listClubs).mockResolvedValueOnce({ items: [CLUB_A], nextCursor: null });
    vi.mocked(joinClub).mockResolvedValueOnce({ clubId: CLUB_A.id, joined: true, memberCount: 13 });

    renderStep();
    await screen.findByText("Riverside FC");
    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    await screen.findByRole("button", { name: "Joined" });

    expect(screen.getByRole("button", { name: /continue to soccernity/i })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /skip for now/i })).toBeNull();
  });

  it("fetches the next page with the returned cursor when Load more is clicked", async () => {
    vi.mocked(listClubs).mockResolvedValueOnce({ items: [CLUB_A], nextCursor: "cursor-1" });
    vi.mocked(listClubs).mockResolvedValueOnce({ items: [CLUB_B], nextCursor: null });

    renderStep();
    await screen.findByText("Riverside FC");

    fireEvent.click(screen.getByRole("button", { name: /load more clubs/i }));

    await waitFor(() => expect(listClubs).toHaveBeenCalledWith("test-token", "cursor-1"));
    expect(await screen.findByText("Harbour United")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /load more clubs/i })).toBeNull();
  });

  it("shows a load error without crashing", async () => {
    vi.mocked(listClubs).mockRejectedValueOnce(new ClubsApiError("Couldn't load clubs (500)."));

    renderStep();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/couldn.t load clubs/i);
  });
});
