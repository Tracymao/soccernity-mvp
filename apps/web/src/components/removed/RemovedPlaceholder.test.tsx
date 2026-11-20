// The "removed by Soccernity" treatment (B-289, Figma M1 to M5, D1 to D4) and the helpers that tell the stubs
// apart from live items. The placeholder is a status line, never a control.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import RemovedPlaceholder from "./RemovedPlaceholder";
import { REMOVED_COMMENT_TEXT, REMOVED_MESSAGE_TEXT, REMOVED_POST_TEXT } from "./removedContent";
import {
  isDeletedMessage,
  isRemovedMessage,
  isRemovedPreview,
  type DeletedMessage,
  type Message,
  type MessagePreview,
  type RemovedMessage,
  type RemovedMessagePreview,
} from "../../api/messaging";
import { reportContextRows, seenLabelMessageId } from "../../pages/messages/actions/messageActionRules";

afterEach(cleanup);

const TAG = "[COPY PENDING LEGAL REVIEW]";

describe("the three sentences", () => {
  it("each carries the legal-review tag at its end, exactly as the frames print it", () => {
    for (const text of [REMOVED_MESSAGE_TEXT, REMOVED_COMMENT_TEXT, REMOVED_POST_TEXT]) {
      expect(text.endsWith(TAG)).toBe(true);
      expect(text).toContain("Soccernity");
    }
    expect(REMOVED_MESSAGE_TEXT).toMatch(/^This message was removed by Soccernity/);
    expect(REMOVED_COMMENT_TEXT).toMatch(/^This comment was removed by Soccernity/);
    expect(REMOVED_POST_TEXT).toMatch(/^Soccernity removed this post\./);
  });
});

describe("RemovedPlaceholder", () => {
  it.each(["bubble", "row", "heading"] as const)("the %s variant prints the label and the tag, in separate spans", (variant) => {
    render(<RemovedPlaceholder text={REMOVED_MESSAGE_TEXT} variant={variant} />);
    const el = screen.getByTestId("removed-placeholder");
    expect(el.classList.contains(`removed-placeholder--${variant}`)).toBe(true);
    expect(el.querySelector(".removed-placeholder__label")?.textContent).toBe("This message was removed by Soccernity");
    expect(el.querySelector(".removed-placeholder__tag")?.textContent).toBe(TAG);
  });

  it("is not interactive and not italic, and hides its icon from assistive technology", () => {
    render(<RemovedPlaceholder text={REMOVED_COMMENT_TEXT} />);
    const el = screen.getByTestId("removed-placeholder");
    expect(within(el).queryByRole("button")).toBeNull();
    expect(within(el).queryByRole("link")).toBeNull();
    expect(el.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(el.querySelector(".msg-deleted")).toBeNull();
    expect(el.className).not.toMatch(/deleted/);
  });

  it("draws the icon strokes in the brand navy, with no other colour", () => {
    render(<RemovedPlaceholder text={REMOVED_POST_TEXT} variant="heading" />);
    const strokes = Array.from(screen.getByTestId("removed-placeholder").querySelectorAll("[stroke]")).map((n) =>
      n.getAttribute("stroke"),
    );
    expect(strokes.length).toBeGreaterThan(0);
    expect(new Set(strokes)).toEqual(new Set(["var(--sn-brand-navy)"]));
  });

  it("shows the meta line (the time) under a bubble when given one", () => {
    render(<RemovedPlaceholder text={REMOVED_MESSAGE_TEXT} variant="bubble" meta="08:06 AM" />);
    expect(screen.getByText("08:06 AM")).toBeTruthy();
  });

  it("a text with no tag prints as it is", () => {
    render(<RemovedPlaceholder text="Plain words" />);
    expect(screen.getByTestId("removed-placeholder").textContent).toContain("Plain words");
    expect(document.querySelector(".removed-placeholder__tag")).toBeNull();
  });
});

describe("telling a removed message from the rest", () => {
  const removed: RemovedMessage = { id: "m-r", sentAt: "2026-11-10T08:00:00.000Z", removedByModeration: true };
  const live: Message = {
    id: "m-l",
    conversationId: "c1",
    senderId: "me",
    contentText: "hello",
    sentAt: "2026-11-10T08:01:00.000Z",
    readAt: "2026-11-10T08:02:00.000Z",
  };
  const deleted: DeletedMessage = {
    id: "m-d",
    conversationId: "c1",
    senderId: "me",
    sentAt: "2026-11-10T08:03:00.000Z",
    editedAt: null,
    deletedForEveryone: true,
    contentText: null,
  };

  it("isRemovedMessage / isDeletedMessage never overlap", () => {
    expect(isRemovedMessage(removed)).toBe(true);
    expect(isRemovedMessage(live)).toBe(false);
    expect(isRemovedMessage(deleted)).toBe(false);
    expect(isDeletedMessage(removed)).toBe(false);
    expect(isDeletedMessage(deleted)).toBe(true);
    expect(isDeletedMessage(live)).toBe(false);
  });

  it("isRemovedPreview tells the preview stub from a text preview", () => {
    const text: MessagePreview = { contentText: "hi", senderId: "me", sentAt: "2026-11-10T08:00:00.000Z" };
    const stub: RemovedMessagePreview = { id: "m-r", sentAt: "2026-11-10T08:00:00.000Z", removedByModeration: true };
    expect(isRemovedPreview(stub)).toBe(true);
    expect(isRemovedPreview(text)).toBe(false);
  });

  it("the 'Seen' label steps over a removed message (it carries no sender and no read time)", () => {
    // My read message, then a removed stub after it: the label still goes under my message.
    expect(seenLabelMessageId([live, removed], "me")).toBe("m-l");
    // Only a removed stub: nothing to put the label under.
    expect(seenLabelMessageId([removed], "me")).toBeNull();
    // A removed stub before it changes nothing.
    expect(seenLabelMessageId([removed, live], "me")).toBe("m-l");
    // A deleted-for-everyone message of mine as the latest still means no label at all.
    expect(seenLabelMessageId([live, removed, deleted], "me")).toBeNull();
  });

  it("report context offers neither a removed nor a deleted message, but keeps their place in the count", () => {
    const reported: Message = { ...live, id: "m-rep", senderId: "other", contentText: "reported", readAt: null };
    const rows = reportContextRows([live, removed, reported, deleted], "m-rep", "me", "Matthew");
    expect(rows.map((r) => r.id)).toEqual(["m-l", "m-rep"]);
    expect(rows.find((r) => r.id === "m-rep")?.reported).toBe(true);
  });
});
