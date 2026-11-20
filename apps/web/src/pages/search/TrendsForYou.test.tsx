// TrendsForYou -- desktop "Trends for you" card wired to the public GET
// /trending. Same conventions as SearchTrendingPage.test.tsx: plain DOM
// assertions, mocks the api client.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import TrendsForYou from "./TrendsForYou";
import { TrendingApiError } from "../../api/trending";

vi.mock("../../api/trending", async () => {
  const actual = await vi.importActual<typeof import("../../api/trending")>("../../api/trending");
  return { ...actual, getTrending: vi.fn() };
});

import { getTrending } from "../../api/trending";

function items(n: number) {
  return Array.from({ length: n }, (_, i) => ({ tag: `tag${i + 1}`, postCount: 100 - i, score: 50 - i }));
}

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(getTrending).mockReset();
});

describe("TrendsForYou", () => {
  it("requests the top 7 and renders each hashtag with its post count", async () => {
    vi.mocked(getTrending).mockResolvedValue({
      items: [
        { tag: "npfl", postCount: 998, score: 12.5 },
        { tag: "europa", postCount: 1, score: 3 },
      ],
    });
    render(<TrendsForYou />);

    expect(await screen.findByText("#npfl")).not.toBeNull();
    expect(screen.getByText("998 Posts")).not.toBeNull();
    expect(screen.getByText("#europa")).not.toBeNull();
    expect(screen.getByText("1 Post")).not.toBeNull();
    expect(getTrending).toHaveBeenCalledTimes(1);
    expect(getTrending).toHaveBeenCalledWith(7);
  });

  it("shows an empty message when nothing is trending", async () => {
    vi.mocked(getTrending).mockResolvedValue({ items: [] });
    render(<TrendsForYou />);

    expect(await screen.findByText("No trends yet.")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "See more" })).toBeNull();
  });

  it("shows the error message when the request fails", async () => {
    vi.mocked(getTrending).mockRejectedValue(new TrendingApiError("Couldn't load trends (500).", { status: 500 }));
    render(<TrendsForYou />);

    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't load trends (500).");
  });

  it("refresh re-fetches with the current limit", async () => {
    vi.mocked(getTrending).mockResolvedValue({ items: items(3) });
    render(<TrendsForYou />);
    await screen.findByText("#tag1");

    fireEvent.click(screen.getByRole("button", { name: "Refresh trends" }));
    await waitFor(() => expect(getTrending).toHaveBeenCalledTimes(2));
    expect(getTrending).toHaveBeenLastCalledWith(7);
  });

  it("offers See more only when a full page came back, and widens the request", async () => {
    vi.mocked(getTrending).mockResolvedValueOnce({ items: items(7) });
    render(<TrendsForYou />);
    await screen.findByText("#tag7");

    vi.mocked(getTrending).mockResolvedValueOnce({ items: items(12) });
    fireEvent.click(screen.getByRole("button", { name: "See more" }));

    expect(await screen.findByText("#tag12")).not.toBeNull();
    expect(getTrending).toHaveBeenLastCalledWith(20);
    expect(screen.queryByRole("button", { name: "See more" })).toBeNull();
  });

  it("does not offer See more when fewer than a full page came back", async () => {
    vi.mocked(getTrending).mockResolvedValue({ items: items(4) });
    render(<TrendsForYou />);
    await screen.findByText("#tag4");

    expect(screen.queryByRole("button", { name: "See more" })).toBeNull();
  });

  it("renders the per-row three-dots control visibly disabled (no backing action exists)", async () => {
    vi.mocked(getTrending).mockResolvedValue({ items: items(2) });
    render(<TrendsForYou />);
    await screen.findByText("#tag1");

    const more = screen.getByRole("button", { name: /more options for #tag1/i }) as HTMLButtonElement;
    expect(more.disabled).toBe(true);
  });
});
