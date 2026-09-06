import { describe, it, expect, beforeEach } from "vitest";
import {
  clearAdminSession,
  decodeAdminToken,
  getAdminAccessToken,
  getAdminRefreshToken,
  storeAdminSession,
} from "./adminSession";

// A well-formed but unsigned JWT: header.payload.signature, payload
// base64url-encodes { sub, role, aud }.
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.sig`;
}

describe("adminSession", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("stores and reads the admin token pair", () => {
    expect(getAdminAccessToken()).toBeNull();
    storeAdminSession({ accessToken: "acc-1", refreshToken: "ref-1" });
    expect(getAdminAccessToken()).toBe("acc-1");
    expect(getAdminRefreshToken()).toBe("ref-1");
  });

  it("clears both tokens", () => {
    storeAdminSession({ accessToken: "acc-1", refreshToken: "ref-1" });
    clearAdminSession();
    expect(getAdminAccessToken()).toBeNull();
    expect(getAdminRefreshToken()).toBeNull();
  });

  it("uses admin-prefixed keys distinct from apps/web's sn_access_token", () => {
    storeAdminSession({ accessToken: "acc-1", refreshToken: "ref-1" });
    expect(window.localStorage.getItem("sn_admin_access_token")).toBe("acc-1");
    expect(window.localStorage.getItem("sn_access_token")).toBeNull();
  });

  it("decodes sub + role from an admin token payload", () => {
    const token = fakeJwt({ sub: "admin-9", role: "moderator", aud: "admin-console" });
    expect(decodeAdminToken(token)).toEqual({ sub: "admin-9", role: "moderator" });
  });

  it("returns null for a malformed token", () => {
    expect(decodeAdminToken("not-a-jwt")).toBeNull();
    expect(decodeAdminToken("a.b")).toBeNull();
  });
});
