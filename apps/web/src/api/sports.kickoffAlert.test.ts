// B-070 -- the credential change in api/sports.ts and the two kickoff-alert writes.
//
// The three reads that carry `kickoffAlert` (live-scores, fixtures, a single match) sit behind the
// backend's OptionalJwtAuthGuard: they never reject, but they only fill the flag in for a request
// that presents the signed-in person's token. These tests FAIL if the credentials are dropped, and
// they pin that a logged-out visitor's request is unchanged.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MATCH_ALREADY_STARTED_CODE,
  SportsApiError,
  getHeadToHead,
  getMatchById,
  getMatchStatistics,
  getStandings,
  listFixtures,
  listLiveScores,
  setKickoffAlert,
} from "./sports";
import { clearSession, seedSession } from "../test/session";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ items: [], nextCursor: null })));
  vi.stubGlobal("fetch", fetchMock);
  clearSession();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearSession();
});

function lastCall(): { url: string; init: { headers?: Record<string, string>; method?: string } | undefined } {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url: String(call[0]), init: call[1] };
}

describe("the three kickoff-alert reads send the signed-in person's credentials", () => {
  it("GET /sports/live-scores carries the Bearer token when a session exists", async () => {
    seedSession("tok-live");
    await listLiveScores();
    expect(lastCall().url).toContain("/sports/live-scores");
    expect(lastCall().init?.headers).toEqual({ Authorization: "Bearer tok-live" });
  });

  it("GET /sports/fixtures carries the Bearer token (and keeps its query) when a session exists", async () => {
    seedSession("tok-fixtures");
    await listFixtures("2026-11-07", { league: "39", cursor: "c1" });
    expect(lastCall().url).toContain("/sports/fixtures?date=2026-11-07");
    expect(lastCall().url).toContain("league=39");
    expect(lastCall().url).toContain("cursor=c1");
    expect(lastCall().init?.headers).toEqual({ Authorization: "Bearer tok-fixtures" });
  });

  it("GET /sports/matches/:id carries the Bearer token when a session exists", async () => {
    seedSession("tok-match");
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ id: "m1", kickoffAlert: true })));
    const match = await getMatchById("m1");
    expect(lastCall().url).toContain("/sports/matches/m1");
    expect(lastCall().init?.headers).toEqual({ Authorization: "Bearer tok-match" });
    expect(match.kickoffAlert).toBe(true);
  });

  it("a logged-out visitor's reads are exactly what they always were: no init, no headers", async () => {
    await listLiveScores();
    expect(fetchMock.mock.calls[0]).toHaveLength(1);
    await listFixtures("2026-11-07");
    expect(fetchMock.mock.calls[1]).toHaveLength(1);
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ id: "m1" })));
    await getMatchById("m1");
    expect(fetchMock.mock.calls[2]).toHaveLength(1);
  });

  it("the token is read at request time, so a later sign-in is picked up", async () => {
    await listLiveScores();
    expect(fetchMock.mock.calls[0]).toHaveLength(1);
    seedSession("tok-later");
    await listLiveScores();
    expect(lastCall().init?.headers).toEqual({ Authorization: "Bearer tok-later" });
  });

  it("every other read stays credential-free even with a session", async () => {
    seedSession("tok-other");
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({})));
    await getMatchStatistics("m1");
    await getHeadToHead("m1");
    await getStandings("39");
    for (const call of fetchMock.mock.calls) {
      expect(call).toHaveLength(1);
    }
  });
});

describe("setKickoffAlert", () => {
  it("PUT turns the alert on and resolves to the server's answer", async () => {
    seedSession("tok-w");
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ subscribed: true })));
    await expect(setKickoffAlert("m1", true)).resolves.toBe(true);
    expect(lastCall().url).toContain("/sports/matches/m1/subscription");
    expect(lastCall().init).toMatchObject({ method: "PUT", headers: { Authorization: "Bearer tok-w" } });
  });

  it("DELETE turns the alert off", async () => {
    seedSession("tok-w");
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ subscribed: false })));
    await expect(setKickoffAlert("m1", false)).resolves.toBe(false);
    expect(lastCall().init).toMatchObject({ method: "DELETE", headers: { Authorization: "Bearer tok-w" } });
  });

  it("a 409 match_already_started surfaces its code on the error", async () => {
    seedSession("tok-w");
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ statusCode: 409, code: MATCH_ALREADY_STARTED_CODE, message: "started" }, 409)),
    );
    const err = await setKickoffAlert("m1", true).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SportsApiError);
    expect((err as SportsApiError).status).toBe(409);
    expect((err as SportsApiError).code).toBe(MATCH_ALREADY_STARTED_CODE);
  });

  it("another failure carries its status and no code", async () => {
    seedSession("tok-w");
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ message: "boom" }, 500)));
    const err = await setKickoffAlert("m1", true).catch((e: unknown) => e);
    expect((err as SportsApiError).status).toBe(500);
    expect((err as SportsApiError).code).toBeUndefined();
  });

  it("a network failure is a SportsApiError with no status", async () => {
    seedSession("tok-w");
    fetchMock.mockImplementation(() => Promise.reject(new TypeError("offline")));
    const err = await setKickoffAlert("m1", true).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SportsApiError);
    expect((err as SportsApiError).status).toBeUndefined();
  });

  it("with no session it fails before sending any request", async () => {
    const err = await setKickoffAlert("m1", true).catch((e: unknown) => e);
    expect((err as SportsApiError).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
