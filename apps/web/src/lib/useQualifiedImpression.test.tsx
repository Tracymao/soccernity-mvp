import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { IMPRESSION_MIN_MS, useQualifiedImpression, type QualifiedImpression } from "./useQualifiedImpression";

type ObserverCallback = (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => void;

// A controllable IntersectionObserver: the test decides what share of the tile is in view.
class FakeObserver {
  static instances: FakeObserver[] = [];
  callback: ObserverCallback;
  disconnected = false;
  constructor(cb: ObserverCallback) {
    this.callback = cb;
    FakeObserver.instances.push(this);
  }
  observe() {}
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

function Probe({ onImpression, enabled = true }: { onImpression: (i: QualifiedImpression) => void; enabled?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useQualifiedImpression(ref, onImpression, enabled);
  return <div ref={ref}>tile</div>;
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  setHidden(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setHidden(false);
});

const observer = () => FakeObserver.instances[FakeObserver.instances.length - 1];

describe("useQualifiedImpression", () => {
  it("reports one impression after the tile has been at least 50% in view for one continuous second", () => {
    const onImpression = vi.fn();
    render(<Probe onImpression={onImpression} />);

    act(() => observer().show(0.8));
    act(() => {
      vi.advanceTimersByTime(IMPRESSION_MIN_MS - 1);
    });
    expect(onImpression).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onImpression).toHaveBeenCalledTimes(1);
    const event = onImpression.mock.calls[0][0] as QualifiedImpression;
    expect(event.visibleRatio).toBeGreaterThanOrEqual(0.5);
    expect(event.visibleRatio).toBeLessThanOrEqual(1);
    expect(event.visibleMs).toBeGreaterThanOrEqual(IMPRESSION_MIN_MS);
    expect(event.eventId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reports exactly 50% as qualifying", () => {
    const onImpression = vi.fn();
    render(<Probe onImpression={onImpression} />);
    act(() => observer().show(0.5));
    act(() => {
      vi.advanceTimersByTime(IMPRESSION_MIN_MS);
    });
    expect(onImpression).toHaveBeenCalledTimes(1);
  });

  it("never reports a tile that is under 50% in view, however long it stays", () => {
    const onImpression = vi.fn();
    render(<Probe onImpression={onImpression} />);
    act(() => observer().show(0.49));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onImpression).not.toHaveBeenCalled();
  });

  it("cancels when the tile drops below 50% before the second is up (the second must be continuous)", () => {
    const onImpression = vi.fn();
    render(<Probe onImpression={onImpression} />);

    act(() => observer().show(0.9));
    act(() => {
      vi.advanceTimersByTime(900);
    });
    act(() => observer().show(0.3));
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(onImpression).not.toHaveBeenCalled();

    // Coming back starts a fresh second: 900 ms more is still not enough.
    act(() => observer().show(0.9));
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(onImpression).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onImpression).toHaveBeenCalledTimes(1);
  });

  it("sends once per stay, then counts again only after the tile leaves view and re-enters", () => {
    const onImpression = vi.fn();
    render(<Probe onImpression={onImpression} />);

    act(() => observer().show(1));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onImpression).toHaveBeenCalledTimes(1);

    // A ratio change that stays above 50% is the same stay.
    act(() => observer().show(0.75));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onImpression).toHaveBeenCalledTimes(1);

    act(() => observer().show(0));
    act(() => observer().show(1));
    act(() => {
      vi.advanceTimersByTime(IMPRESSION_MIN_MS);
    });
    expect(onImpression).toHaveBeenCalledTimes(2);
    const ids = onImpression.mock.calls.map((call) => (call[0] as QualifiedImpression).eventId);
    expect(new Set(ids).size).toBe(2); // every event has its own idempotency key
  });

  it("claims no more than the smallest share it saw during the second", () => {
    const onImpression = vi.fn();
    render(<Probe onImpression={onImpression} />);
    act(() => observer().show(1));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    act(() => observer().show(0.6));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect((onImpression.mock.calls[0][0] as QualifiedImpression).visibleRatio).toBe(0.6);
  });

  it("does not count time in a hidden tab", () => {
    const onImpression = vi.fn();
    render(<Probe onImpression={onImpression} />);
    act(() => observer().show(1));
    act(() => {
      vi.advanceTimersByTime(600);
    });
    act(() => setHidden(true));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onImpression).not.toHaveBeenCalled();

    // Back in the tab: a fresh second is needed.
    act(() => setHidden(false));
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(onImpression).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onImpression).toHaveBeenCalledTimes(1);
  });

  it("stops observing and drops a pending second when the tile unmounts", () => {
    const onImpression = vi.fn();
    const { unmount } = render(<Probe onImpression={onImpression} />);
    const obs = observer();
    act(() => obs.show(1));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    unmount();
    expect(obs.disconnected).toBe(true);
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(onImpression).not.toHaveBeenCalled();
  });

  it("observes nothing when disabled, and reports nothing without IntersectionObserver", () => {
    const onImpression = vi.fn();
    render(<Probe onImpression={onImpression} enabled={false} />);
    expect(FakeObserver.instances).toHaveLength(0);
    cleanup();

    vi.stubGlobal("IntersectionObserver", undefined);
    render(<Probe onImpression={onImpression} />);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onImpression).not.toHaveBeenCalled();
  });
});
