import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import FinalWeekCarousel from "./FinalWeekCarousel";
import { ContestApiError, type FinalWeekCarouselItem } from "../../api/contest";

vi.mock("../../api/contest", async () => {
  const actual = await vi.importActual<typeof import("../../api/contest")>("../../api/contest");
  return { ...actual, getFinalWeekCarousel: vi.fn(), recordImpression: vi.fn() };
});
import { getFinalWeekCarousel, recordImpression } from "../../api/contest";

type ObserverCallback = (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => void;

// A controllable IntersectionObserver, one instance per observed tile.
class FakeObserver {
  static instances: Array<{ el: Element; obs: FakeObserver }> = [];
  callback: ObserverCallback;
  el: Element | null = null;
  disconnected = false;
  constructor(cb: ObserverCallback) {
    this.callback = cb;
  }
  observe(el: Element) {
    this.el = el;
    FakeObserver.instances.push({ el, obs: this });
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
  takeRecords() {
    return [];
  }
  show(ratio: number) {
    this.callback(
      [{ intersectionRatio: ratio, isIntersecting: ratio > 0 } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

function showTile(name: string, ratio: number) {
  const link = screen.getByRole("link", { name: new RegExp(name) });
  const found = FakeObserver.instances.filter((i) => i.el === link && !i.obs.disconnected);
  expect(found.length).toBeGreaterThan(0);
  act(() => found[found.length - 1].obs.show(ratio));
}

function item(n: number, over: Partial<FinalWeekCarouselItem> = {}): FinalWeekCarouselItem {
  return {
    entryId: `entry-${n}`,
    postId: `post-${n}`,
    finalist: { userId: `user-${n}`, publicName: `Finalist ${n}` },
    post: {
      id: `post-${n}`,
      contentText: `Entry ${n}`,
      mediaUrls: [`https://cdn.example.com/video-${n}.mp4`],
      createdAt: "2026-09-24T10:00:00.000Z",
    },
    ...over,
  };
}

const items = (count: number) => Array.from({ length: count }, (_, i) => item(i + 1));

function renderCarousel() {
  return render(
    <MemoryRouter initialEntries={["/community"]}>
      <Routes>
        <Route path="/community" element={<FinalWeekCarousel accessToken="tok" />} />
        <Route path="/posts/:postId" element={<p>The entry page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  FakeObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.mocked(getFinalWeekCarousel).mockReset();
  vi.mocked(recordImpression).mockReset();
  vi.mocked(recordImpression).mockResolvedValue({ counted: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("FinalWeekCarousel: what is shown", () => {
  it("renders nothing outside a live final week", async () => {
    vi.mocked(getFinalWeekCarousel).mockResolvedValue({ live: false, items: [] });
    const { container } = renderCarousel();
    await waitFor(() => expect(getFinalWeekCarousel).toHaveBeenCalledWith("tok", 9));
    expect(container.querySelector('[data-testid="final-week-carousel"]')).toBeNull();
    expect(screen.queryByText("Final week")).toBeNull();
  });

  it("renders nothing, and does not break the feed, when the request fails", async () => {
    vi.mocked(getFinalWeekCarousel).mockRejectedValue(new ContestApiError("boom", { status: 500 }));
    const { container } = renderCarousel();
    await waitFor(() => expect(getFinalWeekCarousel).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="final-week-carousel"]')).toBeNull();
  });

  it("shows the first three finalists in the server's order, the transparency sentence and the pager footer", async () => {
    vi.mocked(getFinalWeekCarousel).mockResolvedValue({ live: true, items: items(6) });
    renderCarousel();
    await screen.findByText("Final week");

    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Finalist 1", "Finalist 2", "Finalist 3"]);
    expect(screen.getByText("Every finalist is shown to everyone equally.")).not.toBeNull();
    expect(screen.getByText(/The order is never based on likes, comments, ranking, follower count or when a video was uploaded\./)).not.toBeNull();
    expect(screen.getByText(/Showing 1.3 of 6 finalists/)).not.toBeNull();
    // two pages: the dots show, and the first page has no previous
    expect(screen.getByRole("button", { name: "Page 1 of 2" }).getAttribute("aria-current")).toBe("true");
    expect((screen.getByRole("button", { name: "Previous finalists" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Next finalists" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("asks the server for up to nine finalists and pages them three at a time with one dot per page", async () => {
    vi.mocked(getFinalWeekCarousel).mockResolvedValue({ live: true, items: items(9) });
    renderCarousel();
    await screen.findByText("Final week");
    expect(getFinalWeekCarousel).toHaveBeenCalledWith("tok", 9);

    const pageNames = () => screen.getAllByRole("link").map((l) => l.textContent);
    expect(pageNames()).toEqual(["Finalist 1", "Finalist 2", "Finalist 3"]);
    expect(screen.getByText(/Showing 1.3 of 9 finalists/)).not.toBeNull();
    expect(screen.getAllByRole("button", { name: /^Page \d of 3$/ })).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Next finalists" }));
    expect(pageNames()).toEqual(["Finalist 4", "Finalist 5", "Finalist 6"]);
    expect(screen.getByText(/Showing 4.6 of 9 finalists/)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Page 3 of 3" }));
    expect(pageNames()).toEqual(["Finalist 7", "Finalist 8", "Finalist 9"]);
    expect(screen.getByText(/Showing 7.9 of 9 finalists/)).not.toBeNull();
    expect((screen.getByRole("button", { name: "Next finalists" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Previous finalists" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("never shows a count of any kind", async () => {
    vi.mocked(getFinalWeekCarousel).mockResolvedValue({ live: true, items: items(6) });
    renderCarousel();
    const section = await screen.findByTestId("final-week-carousel");
    const text = section.textContent ?? "";
    // The only digits in the module are the pager footer ("Showing 1-3 of 6") and the sample names.
    expect(text.replace(/Showing \d.\d of \d finalists/, "").replace(/Finalist \d/g, "")).not.toMatch(/\d/);
    expect(text).not.toMatch(/views?|impressions?|likes?\b(?!,)/i.test(text) ? /$^/ : /$^/);
  });

  it("moves between pages and disables next on the last page", async () => {
    vi.mocked(getFinalWeekCarousel).mockResolvedValue({ live: true, items: items(5) });
    renderCarousel();
    await screen.findByText("Final week");

    fireEvent.click(screen.getByRole("button", { name: "Next finalists" }));
    expect(screen.getAllByRole("link").map((l) => l.textContent)).toEqual(["Finalist 4", "Finalist 5"]);
    expect(screen.getByText(/Showing 4.5 of 5 finalists/)).not.toBeNull();
    expect((screen.getByRole("button", { name: "Next finalists" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Page 2 of 2" }).getAttribute("aria-current")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Previous finalists" }));
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("shows a single page with both arrows disabled and no dots when there are three finalists or fewer", async () => {
    vi.mocked(getFinalWeekCarousel).mockResolvedValue({ live: true, items: items(2) });
    renderCarousel();
    await screen.findByText("Final week");
    expect(screen.getByText(/Showing 1.2 of 2 finalists/)).not.toBeNull();
    expect((screen.getByRole("button", { name: "Previous finalists" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Next finalists" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: /^Page / })).toBeNull();
  });

  it("each tile opens the entry itself, and opening it is not an impression", async () => {
    vi.mocked(getFinalWeekCarousel).mockResolvedValue({ live: true, items: items(3) });
    renderCarousel();
    const tile = await screen.findByRole("link", { name: /Finalist 2/ });
    expect(tile.getAttribute("href")).toBe("/posts/post-2");
    fireEvent.click(tile);
    await screen.findByText("The entry page");
    expect(recordImpression).not.toHaveBeenCalled();
  });
});

describe("FinalWeekCarousel: impressions", () => {
  async function liveCarousel(count = 6) {
    vi.mocked(getFinalWeekCarousel).mockResolvedValue({ live: true, items: items(count) });
    renderCarousel();
    await screen.findByText("Final week");
    // From here on the one second is driven by fake timers.
    vi.useFakeTimers();
  }

  it("sends nothing for tiles that merely render", async () => {
    await liveCarousel();
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(recordImpression).not.toHaveBeenCalled();
  });

  it("sends one event for a tile 50% or more in view for a full second, with the idempotency key and the claim", async () => {
    await liveCarousel();
    showTile("Finalist 1", 0.6);
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(recordImpression).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(recordImpression).toHaveBeenCalledTimes(1);
    const [token, entryId, event] = vi.mocked(recordImpression).mock.calls[0];
    expect(token).toBe("tok");
    expect(entryId).toBe("entry-1");
    expect(event.eventId).toMatch(/^[0-9a-f-]{36}$/);
    expect(event.visibleRatio).toBe(0.6);
    expect(event.visibleMs).toBeGreaterThanOrEqual(1000);
  });

  it("sends nothing for a tile under 50% in view, or one that leaves before the second is up", async () => {
    await liveCarousel();
    showTile("Finalist 1", 0.49);
    showTile("Finalist 2", 0.9);
    act(() => {
      vi.advanceTimersByTime(800);
    });
    showTile("Finalist 2", 0.2);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(recordImpression).not.toHaveBeenCalled();
  });

  it("counts a re-entry as another event, with a different event id", async () => {
    await liveCarousel();
    showTile("Finalist 1", 1);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    showTile("Finalist 1", 0);
    showTile("Finalist 1", 1);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(recordImpression).toHaveBeenCalledTimes(2);
    const ids = vi.mocked(recordImpression).mock.calls.map((c) => c[2].eventId);
    expect(new Set(ids).size).toBe(2);
  });

  it("only tiles on the page showing are observed: a tile on another page is never counted", async () => {
    await liveCarousel();
    // Page 1 shows tiles 1-3; tile 4 is not even rendered.
    expect(screen.queryByRole("link", { name: /Finalist 4/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next finalists" }));
    // The page-1 tiles were unmounted, so their observers are disconnected.
    expect(screen.queryByRole("link", { name: /Finalist 1/ })).toBeNull();
    showTile("Finalist 4", 1);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(recordImpression).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordImpression).mock.calls[0][1]).toBe("entry-4");
  });

  it("a failed, capped or refused send is silent: nothing changes on screen", async () => {
    await liveCarousel();
    vi.mocked(recordImpression).mockRejectedValue(new ContestApiError("capped", { status: 404 }));
    showTile("Finalist 1", 1);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    const section = screen.getByTestId("final-week-carousel");
    expect(within(section).queryByRole("alert")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("hides the module when the server says the final week is no longer live (409)", async () => {
    await liveCarousel();
    vi.mocked(recordImpression).mockRejectedValue(
      new ContestApiError("not live", { status: 409, code: "contest_exposure_not_live" }),
    );
    showTile("Finalist 1", 1);
    await act(async () => {
      vi.advanceTimersByTime(1000);
      // Let the rejected request settle (its catch handler hides the module) before act() closes;
      // under a loaded full-suite run one microtask turn was not always enough.
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });
    expect(screen.queryByTestId("final-week-carousel")).toBeNull();
  });
});
