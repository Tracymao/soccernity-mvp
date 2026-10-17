import { describe, it, expect, beforeEach } from "vitest";
import {
  clearStoredSession,
  getStoredAccessToken,
  getStoredRefreshToken,
  replaceStoredTokens,
  storeSession,
} from "./session";

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("storeSession (B-017)", () => {
  it("writes both tokens to sessionStorage when not persistent", () => {
    storeSession({ accessToken: "a1", refreshToken: "r1" }, false);
    expect(window.sessionStorage.getItem("sn_access_token")).toBe("a1");
    expect(window.sessionStorage.getItem("sn_refresh_token")).toBe("r1");
    expect(window.localStorage.getItem("sn_access_token")).toBeNull();
  });

  it("writes to localStorage when persistent and removes a stale session-scoped pair", () => {
    storeSession({ accessToken: "old", refreshToken: "oldr" }, false);
    storeSession({ accessToken: "a2", refreshToken: "r2" }, true);
    expect(window.localStorage.getItem("sn_refresh_token")).toBe("r2");
    expect(window.sessionStorage.getItem("sn_access_token")).toBeNull();
    expect(getStoredAccessToken()).toBe("a2");
    expect(getStoredRefreshToken()).toBe("r2");
  });

  it("replaceStoredTokens keeps the session in the location that already holds it", () => {
    storeSession({ accessToken: "a", refreshToken: "r" }, true);
    replaceStoredTokens({ accessToken: "a2", refreshToken: "r2" });
    expect(window.localStorage.getItem("sn_access_token")).toBe("a2");
    expect(window.sessionStorage.getItem("sn_access_token")).toBeNull();

    clearStoredSession();
    storeSession({ accessToken: "b", refreshToken: "rb" }, false);
    replaceStoredTokens({ accessToken: "b2", refreshToken: "rb2" });
    expect(window.sessionStorage.getItem("sn_refresh_token")).toBe("rb2");
    expect(window.localStorage.getItem("sn_refresh_token")).toBeNull();
  });
});
