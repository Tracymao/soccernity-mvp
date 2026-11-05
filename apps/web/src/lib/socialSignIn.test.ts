// B-085: the browser half of the OAuth round trip (the saved `state` that stops login CSRF).
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

vi.mock("../api/socialAuth", async () => {
  const actual = await vi.importActual<typeof import("../api/socialAuth")>("../api/socialAuth");
  return { ...actual, startSocialSignIn: vi.fn() };
});
import { startSocialSignIn } from "../api/socialAuth";
import { beginSocialSignIn, savePendingSocialSignIn, takePendingSocialSignIn } from "./socialSignIn";

const assign = vi.fn();
beforeEach(() => {
  window.sessionStorage.clear();
  assign.mockReset();
  vi.mocked(startSocialSignIn).mockReset();
  vi.stubGlobal("location", { ...window.location, assign });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pending social sign-in", () => {
  it("is read once and then gone", () => {
    savePendingSocialSignIn({ provider: "google", state: "abc", staySignedIn: true });
    expect(takePendingSocialSignIn()).toEqual({ provider: "google", state: "abc", staySignedIn: true });
    expect(takePendingSocialSignIn()).toBeNull();
  });

  it("returns null for nothing saved or a damaged entry", () => {
    expect(takePendingSocialSignIn()).toBeNull();
    window.sessionStorage.setItem("sn_social_pending", "{not json");
    expect(takePendingSocialSignIn()).toBeNull();
  });
});

describe("beginSocialSignIn", () => {
  it("saves the state from the authorisation URL and sends the browser there", async () => {
    vi.mocked(startSocialSignIn).mockResolvedValue({ authorizationUrl: "https://accounts.example/o?state=xyz&x=1" });
    await beginSocialSignIn("facebook", true);
    expect(startSocialSignIn).toHaveBeenCalledWith("facebook", true);
    expect(assign).toHaveBeenCalledWith("https://accounts.example/o?state=xyz&x=1");
    expect(takePendingSocialSignIn()).toEqual({ provider: "facebook", state: "xyz", staySignedIn: true });
  });

  it("does not redirect when the URL carries no state", async () => {
    vi.mocked(startSocialSignIn).mockResolvedValue({ authorizationUrl: "https://accounts.example/o" });
    await expect(beginSocialSignIn("google", false)).rejects.toThrow();
    expect(assign).not.toHaveBeenCalled();
  });

  it("does not redirect when the API refuses", async () => {
    vi.mocked(startSocialSignIn).mockRejectedValue(new Error("404"));
    await expect(beginSocialSignIn("google", false)).rejects.toThrow();
    expect(assign).not.toHaveBeenCalled();
  });
});
