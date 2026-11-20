import { describe, it, expect, vi, afterEach } from "vitest";
import {
  SENSITIVE_REPHRASE_CODE,
  UsersApiError,
  blockUser,
  deleteProfileImage,
  getBlockedUsers,
  getPublicProfile,
  unblockUser,
  updateUser,
  uploadProfileImage,
} from "./users";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api/users profile and block clients", () => {
  it("getPublicProfile reads GET /users/:id/public-profile with the bearer token", async () => {
    const fn = mockFetch(200, { id: "u2", publicName: "tobi_9" });
    await expect(getPublicProfile("tok", "u2")).resolves.toMatchObject({ publicName: "tobi_9" });
    const [url, init] = fn.mock.calls[0];
    expect(String(url)).toMatch(/\/users\/u2\/public-profile$/);
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("a 404 is a UsersApiError carrying status 404 (the page renders the generic not-found view)", async () => {
    mockFetch(404, { message: "User not found" });
    await expect(getPublicProfile("tok", "u2")).rejects.toMatchObject({ status: 404 });
  });

  it("surfaces the server's coded error: code and flaggedFields", async () => {
    mockFetch(422, {
      message: "Please rephrase.",
      code: SENSITIVE_REPHRASE_CODE,
      flaggedFields: [{ field: "bio", categories: ["health"] }],
    });
    const error = await updateUser("tok", "u1", { bio: "x" }).catch((e) => e);
    expect(error).toBeInstanceOf(UsersApiError);
    expect(error.status).toBe(422);
    expect(error.code).toBe(SENSITIVE_REPHRASE_CODE);
    expect(error.flaggedFields).toEqual([{ field: "bio", categories: ["health"] }]);
  });

  it("uploadProfileImage posts multipart form data to /users/:id/avatar and returns the avatar", async () => {
    const fn = mockFetch(200, { avatar: { url: "https://img/x.png", status: "pending" } });
    const result = await uploadProfileImage("tok", "u1", "avatar", new Blob(["x"], { type: "image/png" }), "me.png");
    expect(result).toEqual({ url: "https://img/x.png", status: "pending" });
    const [url, init] = fn.mock.calls[0];
    expect(String(url)).toMatch(/\/users\/u1\/avatar$/);
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBeInstanceOf(Blob);
    // The browser sets the multipart boundary: no JSON content type may be forced.
    expect(init.headers["Content-Type"]).toBeUndefined();
  });

  it("uploadProfileImage uses /cover for the cover photo", async () => {
    const fn = mockFetch(200, { cover: { url: "https://img/c.png", status: "pending" } });
    await uploadProfileImage("tok", "u1", "cover", new Blob(["x"]), "c.png");
    expect(String(fn.mock.calls[0][0])).toMatch(/\/users\/u1\/cover$/);
  });

  it("deleteProfileImage sends DELETE", async () => {
    const fn = mockFetch(204, null);
    await deleteProfileImage("tok", "u1", "avatar");
    expect(fn.mock.calls[0][1].method).toBe("DELETE");
  });

  it("blockUser sends the trimmed private note, and nothing when it is empty", async () => {
    const fn = mockFetch(204, null);
    await blockUser("tok", "u2", "  spam  ");
    expect(JSON.parse(fn.mock.calls[0][1].body)).toEqual({ reason: "spam" });
    await blockUser("tok", "u2", "   ");
    expect(JSON.parse(fn.mock.calls[1][1].body)).toEqual({});
  });

  it("unblockUser sends DELETE /users/:id/block", async () => {
    const fn = mockFetch(204, null);
    await unblockUser("tok", "u2");
    expect(String(fn.mock.calls[0][0])).toMatch(/\/users\/u2\/block$/);
    expect(fn.mock.calls[0][1].method).toBe("DELETE");
  });

  it("getBlockedUsers passes the cursor", async () => {
    const fn = mockFetch(200, { items: [], nextCursor: null });
    await getBlockedUsers("tok", "me", "abc/def");
    expect(String(fn.mock.calls[0][0])).toMatch(/\/users\/me\/blocks\?cursor=abc%2Fdef$/);
  });

  it("a follow refusal (403 you_blocked_this_user) keeps the server's own message and code", async () => {
    mockFetch(403, { message: "You blocked this user.", code: "you_blocked_this_user" });
    const error = await blockUser("tok", "u2").catch((e) => e);
    expect(error.message).toBe("You blocked this user.");
    expect(error.code).toBe("you_blocked_this_user");
  });
});
