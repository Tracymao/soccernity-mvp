// Drives the real api clients against a mocked fetch returning the server's
// actual under-16 403 body (Under16RestrictionGuard), including its
// age-revealing `message`, and proves the threshold never reaches the UI.
import { describe, it, expect, vi, afterEach } from "vitest";
import { listConversations, sendMessage } from "../api/messaging";
import { createRoom, getRoomById } from "../api/banter";
import { createCommunityGroup } from "../api/community-groups";
import { UNDER_16_MESSAGE, isUnder16Restricted } from "./under16";

function respond(status: number, body: object) {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify(body), { status })));
}
const restricted = {
  statusCode: 403,
  error: "Forbidden",
  code: "under_16_restricted",
  feature: "messaging",
  message: "Direct messaging is not available for accounts under 16.",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

async function rejection(p: Promise<unknown>): Promise<Error> {
  return p.then(
    () => {
      throw new Error("expected rejection");
    },
    (e) => e as Error,
  );
}

describe("under_16_restricted handling", () => {
  it("replaces the server message on a write endpoint (send message)", async () => {
    respond(403, restricted);
    const err = await rejection(sendMessage("t", "c1", { contentText: "hi" }));
    expect(err.message).toBe(UNDER_16_MESSAGE);
    expect(err.message).not.toMatch(/16/);
    expect(isUnder16Restricted(err)).toBe(true);
  });

  it("replaces the fixed fallback on a read endpoint (inbox, Bants room)", async () => {
    respond(403, { ...restricted, feature: "banter" });
    const inbox = await rejection(listConversations("t"));
    const room = await rejection(getRoomById("t", "r1"));
    for (const err of [inbox, room]) {
      expect(err.message).toBe(UNDER_16_MESSAGE);
      expect(isUnder16Restricted(err)).toBe(true);
    }
  });

  it("covers Bants room creation and Community Group creation", async () => {
    respond(403, restricted);
    const room = await rejection(createRoom("t", { name: "x", scopeType: "topic" } as never));
    const group = await rejection(createCommunityGroup("t", { name: "x", city: "Lagos" }));
    expect(room.message).toBe(UNDER_16_MESSAGE);
    expect(group.message).toBe(UNDER_16_MESSAGE);
  });

  it("leaves every other failure exactly as before", async () => {
    respond(403, { statusCode: 403, message: "This account is awaiting guardian consent and cannot access this feature yet." });
    const consent = await rejection(sendMessage("t", "c1", { contentText: "hi" }));
    expect(consent.message).toMatch(/awaiting guardian consent/);
    expect(isUnder16Restricted(consent)).toBe(false);

    respond(404, { statusCode: 404, message: "User not found" });
    expect((await rejection(sendMessage("t", "c1", { contentText: "hi" }))).message).toBe("User not found");

    respond(500, {});
    expect((await rejection(listConversations("t"))).message).toBe("Couldn't load your messages (500).");
  });
});
