// B-067: the client-side rules and error mapping. The server decides all of
// them; these only decide what the screen says.
import { describe, it, expect } from "vitest";
import { MessagingApiError, type Message } from "../../../api/messaging";
import {
  EDIT_WINDOW_MS,
  WORDING,
  canEditNow,
  deleteChatFailure,
  deleteFailure,
  editFailure,
  firstNameOf,
} from "./messageActionRules";

function msgSentAt(sentAt: number): Message {
  return {
    id: "m",
    conversationId: "c",
    senderId: "s",
    contentText: "t",
    sentAt: new Date(sentAt).toISOString(),
    readAt: null,
  };
}

describe("canEditNow (a hint; the server's clock decides)", () => {
  const sent = Date.parse("2026-11-07T10:00:00.000Z");
  it("is true up to exactly 15 minutes and false after", () => {
    expect(EDIT_WINDOW_MS).toBe(15 * 60 * 1000);
    expect(canEditNow(msgSentAt(sent), sent)).toBe(true);
    expect(canEditNow(msgSentAt(sent), sent + EDIT_WINDOW_MS)).toBe(true);
    expect(canEditNow(msgSentAt(sent), sent + EDIT_WINDOW_MS + 1)).toBe(false);
  });
});

describe("firstNameOf", () => {
  it("returns the first word, or null when there is no name", () => {
    expect(firstNameOf("Matthew Amuloko")).toBe("Matthew");
    expect(firstNameOf("  Sam  ")).toBe("Sam");
    expect(firstNameOf("")).toBeNull();
    expect(firstNameOf("   ")).toBeNull();
    expect(firstNameOf(null)).toBeNull();
    expect(firstNameOf(undefined)).toBeNull();
  });
});

describe("editFailure", () => {
  it("maps the three edit codes, whatever the server's wording", () => {
    expect(editFailure(new MessagingApiError("x", { status: 409, code: "message_edit_window_closed" }))).toEqual({
      status: "window-closed",
      text: WORDING.editWindowClosed,
    });
    expect(editFailure(new MessagingApiError("x", { status: 409, code: "message_not_editable" })).status).toBe(
      "not-editable",
    );
    expect(editFailure(new MessagingApiError("x", { status: 403, code: "message_edit_not_sender" })).text).toBe(
      WORDING.editNotSender,
    );
  });

  it("shows the server's sentence for another 4xx, and the connection line for a network or 5xx failure", () => {
    expect(editFailure(new MessagingApiError("You blocked this person.", { status: 403 })).text).toBe(
      "You blocked this person.",
    );
    expect(editFailure(new MessagingApiError("boom", { status: 500 })).text).toBe(WORDING.editError);
    expect(editFailure(new MessagingApiError("offline")).text).toBe(WORDING.editError);
    expect(editFailure(new Error("not ours")).text).toBe(WORDING.editError);
  });
});

describe("deleteFailure and deleteChatFailure", () => {
  it("map the not-sender code, show a server 4xx sentence, and otherwise the connection line", () => {
    expect(deleteFailure(new MessagingApiError("x", { status: 403, code: "message_delete_not_sender" }))).toBe(
      WORDING.deleteNotSender,
    );
    expect(deleteFailure(new MessagingApiError("Gone.", { status: 404 }))).toBe("Gone.");
    expect(deleteFailure(new MessagingApiError("offline"))).toBe(WORDING.deleteError);
    expect(deleteChatFailure(new MessagingApiError("offline"))).toBe(WORDING.deleteChatError);
    expect(deleteChatFailure(new MessagingApiError("Nope.", { status: 403 }))).toBe("Nope.");
  });
});

describe("wording", () => {
  it("promises no erasure anywhere", () => {
    for (const text of Object.values(WORDING)) {
      expect(text).not.toMatch(/permanently|erase|wiped/i);
    }
  });

  it("carries the tag only on the one line the frames tag", () => {
    const tagged = Object.entries(WORDING).filter(([, text]) => text.includes("[COPY PENDING LEGAL REVIEW]"));
    expect(tagged.map(([key]) => key)).toEqual(["retention"]);
  });
});
