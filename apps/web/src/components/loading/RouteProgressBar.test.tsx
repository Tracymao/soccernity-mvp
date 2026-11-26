// Page loader (Decision Log #581): the route progress bar. Fake timers here only.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router";
import RouteProgressBar, { MAX_WINDOW_MS, QUIET_MS, SHOW_DELAY_MS } from "./RouteProgressBar";
import { __resetFetchActivityForTests, installFetchActivity } from "./activity";

const realFetch = window.fetch;
let pending: Array<(response: Response) => void> = [];
let navigate!: ReturnType<typeof useNavigate>;

function NavigateProbe() {
  navigate = useNavigate();
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  pending = [];
  window.fetch = vi.fn(
    () => new Promise<Response>((resolve) => pending.push(resolve)),
  ) as unknown as typeof window.fetch;
  installFetchActivity();
});

afterEach(() => {
  cleanup();
  __resetFetchActivityForTests();
  window.fetch = realFetch;
  vi.useRealTimers();
});

function setup() {
  const view = render(
    <MemoryRouter initialEntries={["/a"]}>
      <NavigateProbe />
      <RouteProgressBar />
    </MemoryRouter>,
  );
  const bar = view.container.querySelector(".sn-route-progress") as HTMLElement;
  return { bar, phase: () => bar.getAttribute("data-phase") };
}

const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const go = (to: string) => act(async () => void (await navigate(to)));
const request = () => act(async () => void window.fetch("/api"));
const settle = () => act(async () => pending.splice(0).forEach((resolve) => resolve(new Response("ok"))));

describe("RouteProgressBar", () => {
  it("is an idle, hidden progressbar named Loading page", () => {
    const { bar, phase } = setup();
    expect(bar.getAttribute("role")).toBe("progressbar");
    expect(bar.getAttribute("aria-label")).toBe("Loading page");
    expect(bar.getAttribute("aria-hidden")).toBe("true");
    expect(phase()).toBe("idle");
  });

  it("stays hidden for a navigation with no requests", async () => {
    const { phase } = setup();
    await advance(1000);
    await go("/b");
    await advance(1000);
    expect(phase()).toBe("idle");
  });

  it("stays hidden when the requests finish before the show delay", async () => {
    const { phase } = setup();
    await request();
    await advance(SHOW_DELAY_MS - 20);
    await settle();
    await advance(1000);
    expect(phase()).toBe("idle");
  });

  it("shows after the delay, then completes and hides after the quiet period", async () => {
    const { bar, phase } = setup();
    await advance(1000);
    await go("/b");
    await request();
    await advance(SHOW_DELAY_MS - 1);
    expect(phase()).toBe("idle");
    await advance(1);
    expect(phase()).toBe("loading");
    expect(bar.getAttribute("aria-hidden")).toBe("false");

    await settle();
    await advance(QUIET_MS - 1);
    expect(phase()).toBe("loading");
    await advance(1);
    expect(phase()).toBe("done");
    expect(bar.getAttribute("aria-hidden")).toBe("true");
  });

  it("opens again for a change of query string alone", async () => {
    const { phase } = setup();
    await advance(1000);
    await go("/a?tab=2");
    await request();
    await advance(SHOW_DELAY_MS);
    expect(phase()).toBe("loading");
  });

  it("ignores a request that starts after the window has closed (polling)", async () => {
    const { phase } = setup();
    await advance(1000);
    await request();
    await advance(5000);
    expect(phase()).toBe("idle");
  });

  it("is not kept open by a poll that starts after the page finished", async () => {
    const { phase } = setup();
    await request();
    await advance(SHOW_DELAY_MS);
    await settle();
    await advance(QUIET_MS);
    expect(phase()).toBe("done");
    await request();
    await advance(5000);
    expect(phase()).toBe("done");
  });

  it("ignores a hash-only change", async () => {
    const { phase } = setup();
    await advance(1000);
    await go("/a#section");
    await request();
    await advance(5000);
    expect(phase()).toBe("idle");
  });

  it("gives up at the 10 second cap when a request never settles", async () => {
    const { phase } = setup();
    await request();
    await advance(MAX_WINDOW_MS - 1);
    expect(phase()).toBe("loading");
    await advance(1);
    expect(phase()).toBe("done");
  });
});
