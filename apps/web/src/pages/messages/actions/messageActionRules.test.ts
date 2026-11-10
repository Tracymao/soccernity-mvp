// B-067: the client-side rules and error mapping. The server decides all of
// them; these only decide what the screen says.
import { describe, it, expect } from "vitest";
import { MessagingApiError, type DeletedMessage, type Message, type ThreadMessage } from "../../../api/messaging";
import {
  EDIT_WINDOW_MS,
  WORDING,
  canEditNow,
  deleteChatFailure,
  deleteFailure,
  editFailure,
  firstNameOf,
  REPORT_CONTEXT_WINDOW,
  reportContextRows,
  seenLabelMessageId,
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

describe("seenLabelMessageId (the Seen label goes under one message only)", () => {
  const ME = "me";
  const OTHER = "them";
  function m(id: string, senderId: string, readAt: string | null): Message {
    return { id, conversationId: "c", senderId, contentText: id, sentAt: "2026-11-08T08:00:00.000Z", readAt };
  }
  const deleted: DeletedMessage = {
    id: "gone",
    conversationId: "c",
    senderId: ME,
    sentAt: "2026-11-08T08:10:00.000Z",
    editedAt: null,
    deletedForEveryone: true,
    contentText: null,
  };
  const READ = "2026-11-08T08:09:00.000Z";

  it("picks the latest message of mine when it was read", () => {
    expect(seenLabelMessageId([m("a", ME, READ), m("b", OTHER, null), m("c", ME, READ)], ME)).toBe("c");
  });

  it("returns null when my latest message was not read, even if an older one was", () => {
    expect(seenLabelMessageId([m("a", ME, READ), m("b", ME, null)], ME)).toBeNull();
  });

  it("ignores messages I received, wherever they sit", () => {
    expect(seenLabelMessageId([m("a", ME, READ), m("b", OTHER, READ)], ME)).toBe("a");
    expect(seenLabelMessageId([m("a", OTHER, READ)], ME)).toBeNull();
  });

  it("returns null when my latest message is a deleted placeholder (no earlier message gets the label)", () => {
    expect(seenLabelMessageId([m("a", ME, READ), deleted], ME)).toBeNull();
  });

  it("returns null for an empty thread or one with no message of mine", () => {
    expect(seenLabelMessageId([], ME)).toBeNull();
    expect(seenLabelMessageId([m("a", OTHER, null)], ME)).toBeNull();
  });
});

// B-286: the rows of the "Add messages for context" step.
describe("reportContextRows", () => {
  const ME = "me";
  const OTHER = "other";
  function m(i: number, senderId = i % 2 === 0 ? ME : OTHER): Message {
    return {
      id: `m${i}`,
      conversationId: "c",
      senderId,
      contentText: `text ${i}`,
      sentAt: new Date(Date.UTC(2026, 10, 2, 8, i)).toISOString(),
      readAt: null,
    };
  }
  function gone(i: number): DeletedMessage {
    return {
      id: `m${i}`,
      conversationId: "c",
      senderId: OTHER,
      sentAt: new Date(Date.UTC(2026, 10, 2, 8, i)).toISOString(),
      editedAt: null,
      deletedForEveryone: true,
      contentText: null,
    };
  }
  const thread = (n: number) => Array.from({ length: n }, (_, i) => m(i));

  it("uses a window of 10", () => {
    expect(REPORT_CONTEXT_WINDOW).toBe(10);
  });

  it("returns the reported message with up to 10 before and 10 after, oldest first", () => {
    const rows = reportContextRows(thread(40), "m20", ME, "Matthew Amuloko");
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 21 }, (_, i) => `m${10 + i}`));
    expect(rows.filter((r) => r.reported).map((r) => r.id)).toEqual(["m20"]);
  });

  it("stops at the ends of the loaded thread", () => {
    expect(reportContextRows(thread(8), "m2", ME, null).map((r) => r.id)).toEqual(
      ["m0", "m1", "m2", "m3", "m4", "m5", "m6", "m7"],
    );
    const last = reportContextRows(thread(30), "m29", ME, null);
    expect(last).toHaveLength(11);
    expect(last[last.length - 1].id).toBe("m29");
  });

  it("is empty when the reported message is not in the list", () => {
    expect(reportContextRows(thread(5), "nope", ME, null)).toEqual([]);
  });

  it("labels the reporter's own messages You and the other person with their name, or 'The other person'", () => {
    const named = reportContextRows(thread(3), "m1", ME, "  Matthew Amuloko ");
    expect(named.map((r) => r.senderLabel)).toEqual(["You", "Matthew Amuloko", "You"]);
    expect(named.map((r) => r.mine)).toEqual([true, false, true]);
    expect(reportContextRows(thread(3), "m1", ME, null)[1].senderLabel).toBe("The other person");
    expect(reportContextRows(thread(3), "m1", ME, "   ")[1].senderLabel).toBe("The other person");
  });

  it("carries the text and the time as the thread has them", () => {
    const row = reportContextRows(thread(3), "m1", ME, null)[1];
    expect(row.text).toBe("text 1");
    expect(row.sentAt).toBe(new Date(Date.UTC(2026, 10, 2, 8, 1)).toISOString());
  });

  it("a message deleted for everyone is not offered but still takes its place in the count", () => {
    // 12 before the reported one; the 3rd before it is a placeholder. The window still starts at m(12-10)=m2.
    const items: ThreadMessage[] = [...thread(12)];
    items[9] = gone(9);
    items.push(m(12, OTHER));
    const rows = reportContextRows(items, "m12", ME, null);
    expect(rows.map((r) => r.id)).toEqual(["m2", "m3", "m4", "m5", "m6", "m7", "m8", "m10", "m11", "m12"]);
    expect(rows.some((r) => r.id === "m9")).toBe(false);
    // Nothing earlier than 10 positions back, so m0 and m1 are outside.
    expect(rows.some((r) => r.id === "m1")).toBe(false);
  });

  it("an edited message is offered with its current text", () => {
    const items = thread(3);
    items[0] = { ...items[0], contentText: "edited text", editedAt: "2026-11-02T08:30:00.000Z" };
    expect(reportContextRows(items, "m1", ME, null)[0].text).toBe("edited text");
  });
});
