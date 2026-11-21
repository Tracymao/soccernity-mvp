import { describe, it, expect, vi, afterEach } from "vitest";
import { FeedApiError, addComment, createPost } from "./feed";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
}

describe("feed write errors carry the server's code", () => {
  it("createPost: a coded 403 keeps status, message and code", async () => {
    stubFetch(403, { statusCode: 403, code: "email_verification_required", message: "Verify your email first." });
    const err = await createPost("tok", { contentText: "x" }).catch((e) => e);
    expect(err).toBeInstanceOf(FeedApiError);
    expect(err.status).toBe(403);
    expect(err.code).toBe("email_verification_required");
    expect(err.message).toBe("Verify your email first.");
  });

  it("addComment: a 403 with no code has an undefined code", async () => {
    stubFetch(403, { statusCode: 403, message: "Forbidden" });
    const err = await addComment("tok", "p1", "hi").catch((e) => e);
    expect(err.status).toBe(403);
    expect(err.code).toBeUndefined();
  });

  it("a non-JSON body falls back to the generic message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("oops", { status: 500 })));
    const err = await addComment("tok", "p1", "hi").catch((e) => e);
    expect(err.status).toBe(500);
    expect(err.code).toBeUndefined();
    expect(err.message).toMatch(/500/);
  });
});
