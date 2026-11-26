// Page loader (Decision Log #581): the in-flight request counter.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetFetchActivityForTests, getInFlight, getMark, installFetchActivity, subscribe } from "./activity";

const realFetch = window.fetch;
let resolve!: (response: Response) => void;
let reject!: (error: unknown) => void;
const inner = vi.fn();

beforeEach(() => {
  inner.mockReset();
  inner.mockImplementation(
    () =>
      new Promise<Response>((res, rej) => {
        resolve = res;
        reject = rej;
      }),
  );
  window.fetch = inner as unknown as typeof window.fetch;
  installFetchActivity();
});

afterEach(() => {
  __resetFetchActivityForTests();
  window.fetch = realFetch;
});

describe("installFetchActivity", () => {
  it("counts up and back down for a resolved request, and passes everything through", async () => {
    const seen: number[] = [];
    subscribe(() => seen.push(getInFlight()));
    const init = { method: "POST" };
    const request = window.fetch("/x", init);
    expect(getInFlight()).toBe(1);
    expect(inner).toHaveBeenCalledWith("/x", init);

    const response = new Response("ok", { status: 418 });
    resolve(response);
    await expect(request).resolves.toBe(response);
    expect(getInFlight()).toBe(0);
    expect(seen).toEqual([1, 0]);
  });

  it("counts back down for a rejected request and hands the caller the same error", async () => {
    const request = window.fetch("/x");
    const error = new TypeError("offline");
    reject(error);
    await expect(request).rejects.toBe(error);
    expect(getInFlight()).toBe(0);
  });

  it("counts back down when fetch throws synchronously", () => {
    inner.mockImplementation(() => {
      throw new TypeError("bad input");
    });
    expect(() => window.fetch("/x")).toThrow("bad input");
    expect(getInFlight()).toBe(0);
  });

  it("returns the inner promise itself", () => {
    const promise = Promise.resolve(new Response("ok"));
    inner.mockImplementation(() => promise);
    expect(window.fetch("/x")).toBe(promise);
  });

  it("installs once: a second call does not wrap again or count twice", () => {
    const wrapped = window.fetch;
    installFetchActivity();
    expect(window.fetch).toBe(wrapped);
    void window.fetch("/x");
    expect(getInFlight()).toBe(1);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it("can count only requests started after a mark", () => {
    void window.fetch("/before");
    const mark = getMark();
    expect(getInFlight(mark)).toBe(0);
    void window.fetch("/after");
    expect(getInFlight(mark)).toBe(1);
    expect(getInFlight()).toBe(2);
  });
});
