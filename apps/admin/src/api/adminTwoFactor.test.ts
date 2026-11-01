import { describe, it, expect, vi, afterEach } from "vitest";
import {
  AdminTwoFactorError,
  INVALID_CODE_MESSAGE,
  classifyCodeFailure,
  completeTwoFactorLogin,
  confirmEnrolmentAtSignIn,
  isEnrolmentRequired,
  isTwoFactorChallenge,
  startEnrolmentAtSignIn,
} from "./adminTwoFactor";

const API = "http://localhost:3000";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("pre-session calls", () => {
  it.each([
    ["completeTwoFactorLogin", () => completeTwoFactorLogin("chal", "123456"), "/admin/auth/login/two-factor", { challengeToken: "chal", code: "123456" }],
    ["startEnrolmentAtSignIn", () => startEnrolmentAtSignIn("enrol"), "/admin/auth/login/two-factor/enrol/start", { enrolmentToken: "enrol" }],
    ["confirmEnrolmentAtSignIn", () => confirmEnrolmentAtSignIn("enrol", "654321"), "/admin/auth/login/two-factor/enrol/confirm", { enrolmentToken: "enrol", code: "654321" }],
  ])("%s POSTs the token in the body with the cookie headers and no Authorization", async (_n, call, path, body) => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await call();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API}${path}`);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).get("X-Auth-Mode")).toBe("cookie");
    expect(new Headers(init.headers).get("Authorization")).toBeNull();
    expect(JSON.parse(init.body)).toEqual(body);
  });

  it("an error carries status, message and body code; a 401 does NOT trigger a refresh or a sign-out", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(429, { message: "Too many attempts. Try again later.", code: "two_factor_code_locked" }));
    vi.stubGlobal("fetch", fetchMock);
    const err = await completeTwoFactorLogin("c", "123456").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdminTwoFactorError);
    expect(err).toMatchObject({ status: 429, message: "Too many attempts. Try again later.", code: "two_factor_code_locked" });

    fetchMock.mockResolvedValue(json(401, { message: INVALID_CODE_MESSAGE }));
    await expect(completeTwoFactorLogin("c", "123456")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock.mock.calls.every(([u]) => !String(u).includes("/admin/auth/refresh"))).toBe(true);
  });

  it("a network failure is an AdminTwoFactorError with status 0", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(startEnrolmentAtSignIn("enrol")).rejects.toMatchObject({ status: 0 });
  });
});

describe("classifyCodeFailure", () => {
  it.each([
    [new AdminTwoFactorError(401, INVALID_CODE_MESSAGE), "wrong"],
    [new AdminTwoFactorError(401, "This sign-in step has expired. Sign in again."), "expired"],
    [new AdminTwoFactorError(400, "Start enrolment first, or it has expired.", "two_factor_no_pending_enrolment"), "expired"],
    [new AdminTwoFactorError(400, "code must be shorter"), "wrong"],
    [new AdminTwoFactorError(429, "Too many attempts. Try again later.", "two_factor_code_locked"), "locked"],
    [new AdminTwoFactorError(429, "ThrottlerException: Too Many Requests"), "locked"],
    [new AdminTwoFactorError(500, "boom"), "other"],
    [new Error("not ours"), "other"],
  ])("%j", (err, expected) => {
    expect(classifyCodeFailure(err)).toBe(expected);
  });
});

describe("login answer guards", () => {
  it("tell a session, a challenge and an enrolment step apart", () => {
    const challenge = { twoFactorRequired: true as const, challengeToken: "c", challengeExpiresInSeconds: 300 };
    const enrol = { twoFactorEnrolmentRequired: true as const, enrolmentToken: "e", expiresInSeconds: 600 };
    const session = { accessToken: "a", accessTokenExpiresIn: 900, refreshTokenExpiresAt: "", admin: {} as never };
    expect([isTwoFactorChallenge(challenge), isEnrolmentRequired(challenge)]).toEqual([true, false]);
    expect([isTwoFactorChallenge(enrol), isEnrolmentRequired(enrol)]).toEqual([false, true]);
    expect([isTwoFactorChallenge(session), isEnrolmentRequired(session)]).toEqual([false, false]);
  });
});
