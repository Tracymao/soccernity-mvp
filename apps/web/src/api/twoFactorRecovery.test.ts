// B-278: the recovery client. Headers, credentials, URLs and error mapping.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RecoveryApiError,
  approveRecovery,
  cancelRecovery,
  confirmRecovery,
  declineRecovery,
  getRecoveryLink,
  isRecoveryUnavailable,
  requestRecovery,
} from "./twoFactorRecovery";

const fetchMock = vi.fn();

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const BASE = "http://localhost:3000/auth/two-factor/recovery";

describe("requests", () => {
  it("POST /request sends email and password, nothing else, and no cookies or auth header", async () => {
    fetchMock.mockResolvedValue(json(202, { audience: "account" }));
    await expect(requestRecovery("a@b.co", "pw")).resolves.toEqual({ audience: "account" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/request`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ email: "a@b.co", password: "pw" });
    expect(init.credentials).toBeUndefined();
    expect(Object.keys(init.headers)).toEqual(["Content-Type"]);
  });

  it("GET /link/:token is the only GET and encodes the token", async () => {
    fetchMock.mockResolvedValue(json(200, { state: "valid", kind: "adult" }));
    await getRecoveryLink("a/b c");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/link/a%2Fb%20c`);
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it.each([
    ["confirm", () => confirmRecovery("tok"), "/confirm", { token: "tok" }],
    ["cancel", () => cancelRecovery("ctok"), "/cancel", { cancelToken: "ctok" }],
    ["approve", () => approveRecovery("tok"), "/guardian/approve", { token: "tok" }],
    ["decline", () => declineRecovery("tok"), "/guardian/decline", { token: "tok" }],
  ] as const)("%s is a POST with its token in the body", async (_n, call, path, body) => {
    fetchMock.mockResolvedValue(json(200, { state: "x" }));
    await call();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}${path}`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(body);
    expect(init.credentials).toBeUndefined();
  });
});

describe("errors", () => {
  it.each([
    ["two_factor_recovery_link_invalid", "invalid"],
    ["two_factor_recovery_link_expired", "expired"],
    ["two_factor_recovery_link_used", "used"],
  ])("a 400 with code %s is link problem %s (the message text is not read)", async (code, problem) => {
    fetchMock.mockResolvedValue(json(400, { code, state: problem, message: "anything at all" }));
    const err = await confirmRecovery("t").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RecoveryApiError);
    expect((err as RecoveryApiError).linkProblem).toBe(problem);
    expect((err as RecoveryApiError).code).toBe(code);
  });

  it("a 400 without a recovery code has no link problem", async () => {
    fetchMock.mockResolvedValue(json(400, { message: "This link is not valid." }));
    const err = (await approveRecovery("t").catch((e: unknown) => e)) as RecoveryApiError;
    expect(err.linkProblem).toBeUndefined();
  });

  it("a 429 carries Retry-After in whole seconds", async () => {
    fetchMock.mockResolvedValue(json(429, { statusCode: 429 }, { "Retry-After": "42" }));
    const err = (await requestRecovery("a@b.co", "pw").catch((e: unknown) => e)) as RecoveryApiError;
    expect(err.status).toBe(429);
    expect(err.retryAfterSeconds).toBe(42);
  });

  it("a 429 with no readable Retry-After leaves it undefined", async () => {
    fetchMock.mockResolvedValue(json(429, { statusCode: 429 }));
    const err = (await requestRecovery("a@b.co", "pw").catch((e: unknown) => e)) as RecoveryApiError;
    expect(err.retryAfterSeconds).toBeUndefined();
  });

  it("503 two_factor_recovery_unavailable is recognised by its code", async () => {
    fetchMock.mockResolvedValue(json(503, { code: "two_factor_recovery_unavailable", message: "x" }));
    const err = await requestRecovery("a@b.co", "pw").catch((e: unknown) => e);
    expect(isRecoveryUnavailable(err)).toBe(true);
    expect(isRecoveryUnavailable(new Error("no"))).toBe(false);
  });

  it("a network failure is an error with no status", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const err = (await requestRecovery("a@b.co", "pw").catch((e: unknown) => e)) as RecoveryApiError;
    expect(err).toBeInstanceOf(RecoveryApiError);
    expect(err.status).toBeUndefined();
  });
});
