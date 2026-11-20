import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { HEARTBEAT_INTERVAL_MS, useViewHeartbeat, type HeartbeatBeat } from "./useViewHeartbeat";

type ObserverCallback = (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => void;

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

interface ProbeProps {
  send: (beat: HeartbeatBeat) => Promise<{ done: boolean }>;
  enabled?: boolean;
  hasVideo?: boolean;
  withVideo?: boolean;
}

function Probe({ send, enabled = true, hasVideo = false, withVideo = false }: ProbeProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  useViewHeartbeat(ref, { enabled, hasVideo, send });
  return <div ref={ref}>{withVideo ? <video data-testid="v" /> : "post"}</div>;
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

const observer = () => FakeObserver.instances[FakeObserver.instances.length - 1];
const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

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

describe("useViewHeartbeat", () => {
  it("sends nothing until the post is at least half on screen", async () => {
    const send = vi.fn().mockResolvedValue({ done: false });
    render(<Probe send={send} />);
    act(() => observer().show(0.4));
    await tick(30_000);
    expect(send).not.toHaveBeenCalled();
  });

  it("reports an active beat as soon as the post is on screen, then one every 3 seconds, under one session id", async () => {
    const send = vi.fn().mockResolvedValue({ done: false });
    render(<Probe send={send} />);
    act(() => observer().show(0.8));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ active: true });
    expect(send.mock.calls[0][0].sessionId).toMatch(/^[0-9a-f-]{36}$/);
    // A text or photo post never carries a playhead.
    expect(send.mock.calls[0][0]).not.toHaveProperty("positionSeconds");

    await tick(HEARTBEAT_INTERVAL_MS);
    await tick(HEARTBEAT_INTERVAL_MS);
    expect(send).toHaveBeenCalledTimes(3);
    const ids = new Set(send.mock.calls.map((call) => (call[0] as HeartbeatBeat).sessionId));
    expect(ids.size).toBe(1);
  });

  it("never reports how long anything has been watched (the server keeps the clock)", async () => {
    const send = vi.fn().mockResolvedValue({ done: false });
    render(<Probe send={send} />);
    act(() => observer().show(1));
    await tick(HEARTBEAT_INTERVAL_MS * 3);
    for (const call of send.mock.calls) {
      expect(Object.keys(call[0] as object).sort()).toEqual(["active", "sessionId"]);
    }
  });

  it("stops when the post leaves view, and a return starts a new session", async () => {
    const send = vi.fn().mockResolvedValue({ done: false });
    render(<Probe send={send} />);
    act(() => observer().show(1));
    const first = (send.mock.calls[0][0] as HeartbeatBeat).sessionId;
    act(() => observer().show(0.1));
    await tick(30_000);
    expect(send).toHaveBeenCalledTimes(1);

    act(() => observer().show(1));
    expect(send).toHaveBeenCalledTimes(2);
    expect((send.mock.calls[1][0] as HeartbeatBeat).sessionId).not.toBe(first);
  });

  it("stops in a hidden tab, and resumes as a new session when the tab returns", async () => {
    const send = vi.fn().mockResolvedValue({ done: false });
    render(<Probe send={send} />);
    act(() => observer().show(1));
    act(() => setHidden(true));
    await tick(30_000);
    expect(send).toHaveBeenCalledTimes(1);
    act(() => setHidden(false));
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("stops for the rest of the stay once the server says done", async () => {
    const send = vi.fn().mockResolvedValue({ done: true });
    render(<Probe send={send} />);
    act(() => observer().show(1));
    await tick(HEARTBEAT_INTERVAL_MS * 5);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("stops silently when a beat fails (not counted, never an error)", async () => {
    const send = vi.fn().mockRejectedValue(new Error("429"));
    render(<Probe send={send} />);
    act(() => observer().show(1));
    await tick(HEARTBEAT_INTERVAL_MS * 5);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("a post with a linked video but no player sends nothing: nothing is watching it", async () => {
    const send = vi.fn().mockResolvedValue({ done: false });
    render(<Probe send={send} hasVideo />);
    act(() => observer().show(1));
    await tick(HEARTBEAT_INTERVAL_MS * 3);
    expect(send).not.toHaveBeenCalled();
  });

  it("a playing video reports the playhead and its length; a paused one reports not active", async () => {
    const send = vi.fn().mockResolvedValue({ done: false });
    const { getByTestId } = render(<Probe send={send} hasVideo withVideo />);
    const video = getByTestId("v") as HTMLVideoElement;
    let paused = false;
    Object.defineProperty(video, "paused", { configurable: true, get: () => paused });
    Object.defineProperty(video, "ended", { configurable: true, get: () => false });
    Object.defineProperty(video, "currentTime", { configurable: true, get: () => 12.5 });
    Object.defineProperty(video, "duration", { configurable: true, get: () => 40 });

    act(() => observer().show(1));
    expect(send.mock.calls[0][0]).toMatchObject({ active: true, positionSeconds: 12.5, durationSeconds: 40 });

    paused = true;
    await tick(HEARTBEAT_INTERVAL_MS);
    expect(send.mock.calls[1][0]).toMatchObject({ active: false, positionSeconds: 12.5 });
  });

  it("sends nothing when disabled (own post, locked entry) or without IntersectionObserver", async () => {
    const send = vi.fn().mockResolvedValue({ done: false });
    render(<Probe send={send} enabled={false} />);
    expect(FakeObserver.instances).toHaveLength(0);
    cleanup();

    vi.stubGlobal("IntersectionObserver", undefined);
    render(<Probe send={send} />);
    await tick(30_000);
    expect(send).not.toHaveBeenCalled();
  });
});
