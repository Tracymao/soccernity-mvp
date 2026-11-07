// B-067: the three new messaging calls and how they carry the server's error
// code. Plain fetch mocks; no network.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  MessagingApiError,
  deleteConversation,
  deleteMessage,
  editMessage,
  isDeletedMessage,
  type ThreadMessage,
} from "./messaging";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function lastCall(): { url: string; init: { method?: string; body?: string; headers?: unknown } } {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url: call[0] as string, init: call[1] as { method?: string; body?: string; headers?: unknown } };
}

describe("editMessage", () => {
  it("PATCHes the message with the new text and returns the result", async () => {
    fetchMock.mockResolvedValue(json(200, { id: "m1", contentText: "New", editedAt: "2026-11-07T10:00:00.000Z" }));
    const result = await editMessage("tok", "c1", "m1", "New");
    expect(result).toEqual({ id: "m1", contentText: "New", editedAt: "2026-11-07T10:00:00.000Z" });
    const { url, init } = lastCall();
    expect(url).toMatch(/\/conversations\/c1\/messages\/m1$/);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ contentText: "New" });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("keeps the status and the server's code on a refusal", async () => {
    fetchMock.mockResolvedValue(
      json(409, { statusCode: 409, code: "message_edit_window_closed", message: "Too late to edit" }),
    );
    const err = await editMessage("tok", "c1", "m1", "New").catch((e) => e);
    expect(err).toBeInstanceOf(MessagingApiError);
    expect(err.status).toBe(409);
    expect(err.code).toBe("message_edit_window_closed");
    expect(err.message).toBe("Too late to edit");
  });

  it("turns a network failure into an error with no status", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    const err = await editMessage("tok", "c1", "m1", "New").catch((e) => e);
    expect(err).toBeInstanceOf(MessagingApiError);
    expect(err.status).toBeUndefined();
  });

  it("still shows the generic wording for the under-16 refusal, never the server's sentence", async () => {
    fetchMock.mockResolvedValue(json(403, { code: "under_16_restricted", message: "not available for accounts under 16" }));
    const err = await editMessage("tok", "c1", "m1", "New").catch((e) => e);
    expect(err.code).toBe("under_16_restricted");
    expect(err.message).not.toMatch(/16/);
  });
});

describe("deleteMessage", () => {
  it.each(["me", "everyone"] as const)("DELETEs with scope=%s", async (scope) => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(deleteMessage("tok", "c1", "m1", scope)).resolves.toBeUndefined();
    const { url, init } = lastCall();
    expect(url).toMatch(new RegExp(`/conversations/c1/messages/m1\\?scope=${scope}$`));
    expect(init.method).toBe("DELETE");
  });

  it("keeps the code on a refusal", async () => {
    fetchMock.mockResolvedValue(json(403, { code: "message_delete_not_sender", message: "no" }));
    const err = await deleteMessage("tok", "c1", "m1", "everyone").catch((e) => e);
    expect(err.status).toBe(403);
    expect(err.code).toBe("message_delete_not_sender");
  });
});

describe("deleteConversation", () => {
  it("DELETEs the conversation", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(deleteConversation("tok", "c1")).resolves.toBeUndefined();
    const { url, init } = lastCall();
    expect(url).toMatch(/\/conversations\/c1$/);
    expect(init.method).toBe("DELETE");
  });

  it("rejects on a failure", async () => {
    fetchMock.mockResolvedValue(json(500, { message: "boom" }));
    const err = await deleteConversation("tok", "c1").catch((e) => e);
    expect(err).toBeInstanceOf(MessagingApiError);
    expect(err.status).toBe(500);
  });
});

describe("isDeletedMessage", () => {
  it("tells the placeholder from a live message", () => {
    const live: ThreadMessage = {
      id: "a",
      conversationId: "c",
      senderId: "s",
      contentText: "hi",
      sentAt: "2026-11-07T10:00:00.000Z",
      readAt: null,
    };
    const gone: ThreadMessage = {
      id: "b",
      conversationId: "c",
      senderId: "s",
      sentAt: "2026-11-07T10:00:00.000Z",
      editedAt: null,
      deletedForEveryone: true,
      contentText: null,
    };
    expect(isDeletedMessage(live)).toBe(false);
    expect(isDeletedMessage(gone)).toBe(true);
  });
});
