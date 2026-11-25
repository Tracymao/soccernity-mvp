import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import VideoPlayer, { formatClock } from "./VideoPlayer";
import { useViewHeartbeat, type HeartbeatBeat } from "../../lib/useViewHeartbeat";

// jsdom has no media playback: give every <video> a small working play/pause/currentTime/duration.
let durationValue = 65;
let playRejects = false;

beforeEach(() => {
  if (typeof window.PointerEvent === "undefined") {
    class PointerEventPolyfill extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: ConstructorParameters<typeof MouseEvent>[1] & { pointerId?: number } = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    }
    vi.stubGlobal("PointerEvent", PointerEventPolyfill);
  }
  durationValue = 65;
  playRejects = false;
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  Object.defineProperty(HTMLMediaElement.prototype, "duration", {
    configurable: true,
    get: () => durationValue,
  });
  Object.defineProperty(HTMLMediaElement.prototype, "paused", {
    configurable: true,
    get(this: HTMLMediaElement & { __paused?: boolean }) {
      return this.__paused !== false;
    },
  });
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement & { __paused?: boolean }) {
    if (playRejects && !this.muted) return Promise.reject(new Error("NotAllowedError"));
    this.__paused = false;
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  };
  HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement & { __paused?: boolean }) {
    this.__paused = true;
    this.dispatchEvent(new Event("pause"));
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const video = (container: HTMLElement) => container.querySelector("video") as HTMLVideoElement;

describe("formatClock", () => {
  it("formats minutes and seconds", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(12.9)).toBe("0:12");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(Number.NaN)).toBe("0:00");
  });
});

describe("VideoPlayer", () => {
  it("renders a real <video> with no native controls and no fullscreen, download or picture-in-picture", () => {
    const { container } = render(<VideoPlayer src="/a.mp4" videoLabel="Clip" />);
    const v = video(container);
    expect(v).toBeTruthy();
    expect(v.hasAttribute("controls")).toBe(false);
    expect(v.getAttribute("controlslist")).toBe("nodownload noplaybackrate nofullscreen");
    expect(v.hasAttribute("disablepictureinpicture")).toBe(true);
    expect(v.getAttribute("aria-label")).toBe("Clip");
    expect(screen.queryByRole("button", { name: /full ?screen|download|speed|picture/i })).toBeNull();
  });

  it("plays and pauses by clicking the video surface, with the button name following the state", () => {
    const { container } = render(<VideoPlayer src="/a.mp4" />);
    fireEvent.click(screen.getByRole("button", { name: "Play video" }));
    expect(video(container).paused).toBe(false);
    expect(container.querySelector(".vp")?.getAttribute("data-paused")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Pause video" }));
    expect(video(container).paused).toBe(true);
    expect(screen.getByRole("button", { name: "Play video" })).toBeTruthy();
  });

  it("toggles mute with an accessible, pressed state", () => {
    const { container } = render(<VideoPlayer src="/a.mp4" />);
    const mute = screen.getByRole("button", { name: "Mute video" });
    expect(mute.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(mute);
    expect(video(container).muted).toBe(true);
    const unmute = screen.getByRole("button", { name: "Unmute video" });
    expect(unmute.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(unmute);
    expect(video(container).muted).toBe(false);
  });

  it("exposes the progress bar as a labelled slider that follows playback", () => {
    const { container } = render(<VideoPlayer src="/a.mp4" />);
    const v = video(container);
    fireEvent.loadedMetadata(v);
    act(() => {
      v.currentTime = 12;
      fireEvent.timeUpdate(v);
    });
    const slider = screen.getByRole("slider", { name: "Video progress" });
    expect(slider.getAttribute("aria-valuemin")).toBe("0");
    expect(slider.getAttribute("aria-valuemax")).toBe("65");
    expect(slider.getAttribute("aria-valuenow")).toBe("12");
    expect(slider.getAttribute("aria-valuetext")).toBe("0:12 of 1:05");
  });

  it("seeks with the keyboard: arrows move 5 seconds, Home and End jump", () => {
    const { container } = render(<VideoPlayer src="/a.mp4" />);
    const v = video(container);
    fireEvent.loadedMetadata(v);
    const slider = screen.getByRole("slider", { name: "Video progress" });
    v.currentTime = 20;
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(v.currentTime).toBe(25);
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(v.currentTime).toBe(20);
    fireEvent.keyDown(slider, { key: "End" });
    expect(v.currentTime).toBe(65);
    fireEvent.keyDown(slider, { key: "Home" });
    expect(v.currentTime).toBe(0);
    v.currentTime = 2;
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(v.currentTime).toBe(0);
  });

  it("seeks by pointer, including while dragging", () => {
    const { container } = render(<VideoPlayer src="/a.mp4" />);
    const v = video(container);
    fireEvent.loadedMetadata(v);
    const slider = screen.getByRole("slider", { name: "Video progress" });
    slider.getBoundingClientRect = () =>
      ({ left: 0, width: 200, top: 0, height: 24, right: 200, bottom: 24, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    fireEvent.pointerDown(slider, { clientX: 100, pointerId: 1 });
    expect(v.currentTime).toBeCloseTo(32.5);
    fireEvent.pointerMove(slider, { clientX: 200, pointerId: 1 });
    expect(v.currentTime).toBe(65);
    fireEvent.pointerMove(slider, { clientX: -50, pointerId: 1 });
    expect(v.currentTime).toBe(0);
    fireEvent.pointerUp(slider, { pointerId: 1 });
    fireEvent.pointerMove(slider, { clientX: 100, pointerId: 1 });
    expect(v.currentTime).toBe(0);
  });

  it("pauses any other player when one starts", () => {
    const { container } = render(
      <>
        <VideoPlayer src="/a.mp4" videoLabel="A" />
        <VideoPlayer src="/b.mp4" videoLabel="B" />
      </>,
    );
    const [a, b] = Array.from(container.querySelectorAll("video"));
    const [playA, playB] = screen.getAllByRole("button", { name: "Play video" });
    fireEvent.click(playA);
    expect(a.paused).toBe(false);
    fireEvent.click(playB);
    expect(b.paused).toBe(false);
    expect(a.paused).toBe(true);
  });

  it("passes load, duration and error callbacks through", () => {
    const onLoadedData = vi.fn();
    const onDuration = vi.fn();
    const onLoadError = vi.fn();
    const { container } = render(
      <VideoPlayer src="/a.mp4" onLoadedData={onLoadedData} onDuration={onDuration} onLoadError={onLoadError} />,
    );
    const v = video(container);
    fireEvent.loadedData(v);
    fireEvent.loadedMetadata(v);
    fireEvent.error(v);
    expect(onLoadedData).toHaveBeenCalledTimes(1);
    expect(onDuration).toHaveBeenCalledWith(65);
    expect(onLoadError).toHaveBeenCalledTimes(1);
  });

  it("autoplays, and falls back to muted when the browser blocks sound", async () => {
    playRejects = true;
    const { container } = render(<VideoPlayer src="/a.mp4" autoPlay />);
    await act(async () => {});
    expect(video(container).muted).toBe(true);
    expect(video(container).paused).toBe(false);
    expect(screen.getByRole("button", { name: "Unmute video" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("does not autoplay unless asked", () => {
    const { container } = render(<VideoPlayer src="/a.mp4" />);
    expect(video(container).paused).toBe(true);
  });

  it("blocks the browser context menu on the video", () => {
    const { container } = render(<VideoPlayer src="/a.mp4" />);
    const notCancelled = fireEvent.contextMenu(video(container));
    expect(notCancelled).toBe(false);
  });
});

describe("VideoPlayer with the view heartbeat", () => {
  it("keeps a real, playing <video> inside the observed element so beats carry the playhead", () => {
    type Cb = (entries: IntersectionObserverEntry[]) => void;
    let callback: Cb = () => {};
    class FakeObserver {
      constructor(cb: Cb) {
        callback = cb;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    const send = vi.fn().mockResolvedValue({ done: false });

    function Probe() {
      const ref = useRef<HTMLDivElement | null>(null);
      useViewHeartbeat(ref, { enabled: true, hasVideo: true, send });
      return (
        <div ref={ref}>
          <VideoPlayer src="/a.mp4" />
        </div>
      );
    }
    const { container } = render(<Probe />);
    const v = video(container);
    fireEvent.loadedMetadata(v);
    fireEvent.click(screen.getByRole("button", { name: "Play video" }));
    v.currentTime = 7;
    act(() =>
      callback([{ intersectionRatio: 1, isIntersecting: true } as IntersectionObserverEntry]),
    );
    expect(send).toHaveBeenCalled();
    const beat = send.mock.calls[0][0] as HeartbeatBeat;
    expect(beat.active).toBe(true);
    expect(beat.positionSeconds).toBe(7);
    expect(beat.durationSeconds).toBe(65);
  });
});
