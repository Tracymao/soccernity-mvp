// B-067: edit, delete for me, delete for everyone and the conversation actions
// menu, on BOTH surfaces that show a conversation: the mobile page
// (ConversationPage) and the Community pop-up (CommunityMessages / ChatWindow).
// The same scenarios run against each, so the two cannot drift apart. Mocks
// src/api/messaging.ts and the one users call (blockUser); plain DOM assertions.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import ConversationPage from "../ConversationPage";
import CommunityMessages from "../../community/messages/CommunityMessages";
import {
  MessagingApiError,
  type Conversation,
  type DeletedMessage,
  type Message,
  type ThreadMessage,
} from "../../../api/messaging";

vi.mock("../../../api/messaging", async () => {
  const actual = await vi.importActual<typeof import("../../../api/messaging")>("../../../api/messaging");
  return {
    ...actual,
    listConversations: vi.fn(),
    getMessages: vi.fn(),
    sendMessage: vi.fn(),
    markConversationRead: vi.fn(),
    editMessage: vi.fn(),
    deleteMessage: vi.fn(),
    deleteConversation: vi.fn(),
  };
});
vi.mock("../../../api/users", async () => {
  const actual = await vi.importActual<typeof import("../../../api/users")>("../../../api/users");
  return { ...actual, blockUser: vi.fn() };
});

import {
  listConversations,
  getMessages,
  markConversationRead,
  editMessage,
  deleteMessage,
  deleteConversation,
} from "../../../api/messaging";
import { blockUser } from "../../../api/users";
import { seedSession, clearSession } from "../../../test/session";

const ME = "user-me";
const OTHER = "u2";
const MINUTE = 60_000;

function base64UrlEncode(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const TOKEN = `${base64UrlEncode({ alg: "none" })}.${base64UrlEncode({ sub: ME, role: "fan" })}.sig`;

function ago(minutes: number): string {
  return new Date(Date.now() - minutes * MINUTE).toISOString();
}

function msg(overrides: Partial<Message> = {}): Message {
  return {
    id: "m",
    conversationId: "c1",
    senderId: OTHER,
    contentText: "text",
    sentAt: ago(1),
    readAt: null,
    ...overrides,
  };
}

// Oldest first here; the mock hands them to the page newest-first, as the API does.
const THEIRS = msg({ id: "m-theirs", senderId: OTHER, contentText: "Their message", sentAt: ago(40) });
const MINE_OLD = msg({ id: "m-old", senderId: ME, contentText: "My older message", sentAt: ago(30) });
const MINE = msg({ id: "m-mine", senderId: ME, contentText: "My recent message", sentAt: ago(2) });

function conversation(): Conversation {
  return {
    id: "c1",
    otherParticipant: { id: OTHER, publicName: "Matthew Amuloko" },
    lastMessageAt: ago(2),
    createdAt: ago(600),
    lastMessage: { contentText: "My recent message", senderId: ME, sentAt: ago(2) },
    unreadCount: 0,
  };
}

function serve(items: ThreadMessage[]) {
  vi.mocked(getMessages).mockResolvedValue({ items: [...items].reverse(), nextCursor: null });
}

function setWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
}

function Where() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname}</div>;
}

type Surface = {
  name: string;
  open: () => Promise<void>;
  // Where "Edited" shows on this surface.
  editedPattern: RegExp;
};

const mobilePage: Surface = {
  name: "mobile page",
  editedPattern: /· Edited/,
  async open() {
    seedSession(TOKEN);
    render(
      <MemoryRouter
        initialEntries={[{ pathname: "/messages/c1", state: { otherParticipant: { id: OTHER, publicName: "Matthew Amuloko" } } }]}
      >
        <Where />
        <Routes>
          <Route path="/messages/:conversationId" element={<ConversationPage />} />
          <Route path="/messages" element={<div>Inbox page</div>} />
          <Route path="/users/:id" element={<div>Profile page</div>} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText("My recent message");
  },
};

const popUp: Surface = {
  name: "Community pop-up",
  editedPattern: /^Edited$/,
  async open() {
    setWidth(1280);
    vi.mocked(listConversations).mockResolvedValue({ items: [conversation()], nextCursor: null });
    render(
      <MemoryRouter initialEntries={["/community"]}>
        <Where />
        <Routes>
          <Route path="/community" element={<CommunityMessages accessToken={TOKEN} currentUserId={ME} />} />
          <Route path="/users/:id" element={<div>Profile page</div>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByText("Matthew Amuloko"));
    await screen.findByText("My recent message");
  },
};

const originalWidth = window.innerWidth;

beforeEach(() => {
  clearSession();
  vi.mocked(markConversationRead).mockResolvedValue({ conversationId: "c1", markedRead: 0 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  setWidth(originalWidth);
});

// The "..." button inside the host that wraps the bubble with this text.
function optionsFor(text: string): HTMLElement {
  const host = screen.getByText(text).closest(".msg-host");
  if (!host) throw new Error(`no actionable bubble for "${text}"`);
  return within(host as HTMLElement).getByRole("button", { name: "Message options" });
}

function openMenuFor(text: string) {
  fireEvent.click(optionsFor(text));
  return screen.getByRole("menu", { name: "Message actions" });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe.each([mobilePage, popUp])("message actions on the $name", (surface) => {
  beforeEach(() => {
    serve([THEIRS, MINE_OLD, MINE]);
  });

  describe("the message menu", () => {
    it("own recent message: Edit (with its hint) and Delete, and no Report", async () => {
      await surface.open();
      const menu = openMenuFor("My recent message");
      const edit = within(menu).getByRole("menuitem", { name: /Edit/ });
      expect((edit as HTMLButtonElement).disabled).toBe(false);
      expect(within(menu).getByText("You can edit for 15 minutes")).toBeTruthy();
      expect(within(menu).getByRole("menuitem", { name: /^Delete$/ })).toBeTruthy();
      expect(within(menu).queryByText(/report/i)).toBeNull();
    });

    it("own message older than 15 minutes: Edit is disabled with its reason", async () => {
      await surface.open();
      const menu = openMenuFor("My older message");
      expect((within(menu).getByRole("menuitem", { name: /Edit/ }) as HTMLButtonElement).disabled).toBe(true);
      expect(within(menu).getByText("Sent more than 15 minutes ago")).toBeTruthy();
    });

    it("their message: only Delete for me, with its hint, and no Edit and no Report", async () => {
      await surface.open();
      const menu = openMenuFor("Their message");
      expect(within(menu).getByRole("menuitem", { name: /Delete for me/ })).toBeTruthy();
      expect(within(menu).getByText("Only you will stop seeing it")).toBeTruthy();
      expect(within(menu).queryByRole("menuitem", { name: /Edit/ })).toBeNull();
      expect(within(menu).queryByText(/report/i)).toBeNull();
    });

    it("Escape closes the menu and puts focus back on its button", async () => {
      await surface.open();
      openMenuFor("My recent message");
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("menu")).toBeNull();
      expect(document.activeElement).toBe(optionsFor("My recent message"));
    });

    it("a click outside the menu closes it", async () => {
      await surface.open();
      openMenuFor("My recent message");
      fireEvent.pointerDown(document.body);
      expect(screen.queryByRole("menu")).toBeNull();
    });

    it("the button reports whether its menu is open", async () => {
      await surface.open();
      const button = optionsFor("My recent message");
      expect(button.getAttribute("aria-expanded")).toBe("false");
      fireEvent.click(button);
      expect(button.getAttribute("aria-expanded")).toBe("true");
    });

    it("a long-press on touch opens the menu; moving the finger first does not", async () => {
      await surface.open();
      vi.useFakeTimers();
      const host = screen.getByText("My recent message").closest(".msg-host") as HTMLElement;

      fireEvent.touchStart(host);
      fireEvent.touchMove(host);
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(screen.queryByRole("menu")).toBeNull();

      fireEvent.touchStart(host);
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(screen.queryByRole("menu")).toBeNull();
      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(screen.getByRole("menu", { name: "Message actions" })).toBeTruthy();
    });
  });

  describe("edit mode", () => {
    async function startEditing() {
      await surface.open();
      const menu = openMenuFor("My recent message");
      fireEvent.click(within(menu).getByRole("menuitem", { name: /Edit/ }));
      return screen.getByRole("textbox", { name: "Edit message text" }) as HTMLInputElement;
    }

    it("replaces the composer with the edit bar, pre-filled, with Save disabled until the text changes", async () => {
      const input = await startEditing();
      expect(screen.getByText("Editing message")).toBeTruthy();
      expect(input.value).toBe("My recent message");
      expect(screen.queryByRole("textbox", { name: /Write a message/ })).toBeNull();
      const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
      expect(save.disabled).toBe(true);
      fireEvent.change(input, { target: { value: "My recent message, edited" } });
      expect(save.disabled).toBe(false);
      fireEvent.change(input, { target: { value: "   " } });
      expect(save.disabled).toBe(true);
    });

    it("Save sends the trimmed text, updates the bubble in place and labels it Edited", async () => {
      const input = await startEditing();
      vi.mocked(editMessage).mockResolvedValue({
        id: "m-mine",
        contentText: "Fixed text",
        editedAt: new Date().toISOString(),
      });
      fireEvent.change(input, { target: { value: "  Fixed text  " } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(screen.getAllByText(/Fixed text/).length).toBeGreaterThan(0));
      expect(vi.mocked(editMessage)).toHaveBeenCalledWith(TOKEN, "c1", "m-mine", "Fixed text");
      expect(screen.queryByText("My recent message")).toBeNull();
      expect(screen.getByText(surface.editedPattern)).toBeTruthy();
      // The composer is back, and nothing was refetched.
      expect(screen.getByRole("textbox", { name: /Write a message/ })).toBeTruthy();
      expect(screen.queryByText("Editing message")).toBeNull();
      expect(vi.mocked(getMessages)).toHaveBeenCalledTimes(1);
    });

    it("saving: the button says Saving…, the input and Cancel are disabled, a second Save is ignored", async () => {
      const input = await startEditing();
      const pending = deferred<{ id: string; contentText: string; editedAt: string }>();
      vi.mocked(editMessage).mockReturnValue(pending.promise);
      fireEvent.change(input, { target: { value: "Changed" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      const saving = await screen.findByRole("button", { name: "Saving…" });
      expect((saving as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByRole("textbox", { name: "Edit message text" }) as HTMLInputElement).disabled).toBe(true);
      expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
      fireEvent.submit(screen.getByRole("form", { name: "Edit message" }));
      expect(vi.mocked(editMessage)).toHaveBeenCalledTimes(1);

      await act(async () => {
        pending.resolve({ id: "m-mine", contentText: "Changed", editedAt: new Date().toISOString() });
      });
      await waitFor(() => expect(screen.getAllByText(/Changed/).length).toBeGreaterThan(0));
    });

    it("a failed save keeps the text and the bar, shows the connection line, and can be retried", async () => {
      const input = await startEditing();
      vi.mocked(editMessage).mockRejectedValueOnce(new MessagingApiError("x"));
      fireEvent.change(input, { target: { value: "Changed" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      expect((await screen.findByRole("alert")).textContent).toBe(
        "Couldn’t save your edit. Check your connection and try again.",
      );
      const again = screen.getByRole("textbox", { name: "Edit message text" }) as HTMLInputElement;
      expect(again.value).toBe("Changed");
      const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
      expect(save.disabled).toBe(false);

      vi.mocked(editMessage).mockResolvedValueOnce({ id: "m-mine", contentText: "Changed", editedAt: new Date().toISOString() });
      fireEvent.click(save);
      await screen.findByText(surface.editedPattern);
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("message_edit_window_closed shows the window-closed line and leaves Save disabled; Cancel returns to the composer", async () => {
      const input = await startEditing();
      vi.mocked(editMessage).mockRejectedValueOnce(
        new MessagingApiError("Too late", { status: 409, code: "message_edit_window_closed" }),
      );
      fireEvent.change(input, { target: { value: "Changed" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      expect((await screen.findByRole("alert")).textContent).toBe(
        "You can only edit a message for 15 minutes. This one can’t be changed now.",
      );
      expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByText("Editing message")).toBeNull();
      expect(screen.getByRole("textbox", { name: /Write a message/ })).toBeTruthy();
      // The bubble is unchanged.
      expect(screen.getByText("My recent message")).toBeTruthy();
    });

    it("message_not_editable and message_edit_not_sender are told apart by code, not by the server's wording", async () => {
      const input = await startEditing();
      vi.mocked(editMessage).mockRejectedValueOnce(
        new MessagingApiError("anything at all", { status: 409, code: "message_not_editable" }),
      );
      fireEvent.change(input, { target: { value: "Changed" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect((await screen.findByRole("alert")).textContent).toBe("This message can’t be edited.");
      expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("a refusal the server chose (a block) shows the server's own sentence", async () => {
      const input = await startEditing();
      vi.mocked(editMessage).mockRejectedValueOnce(
        new MessagingApiError("You blocked this person.", { status: 403, code: "you_blocked_this_user" }),
      );
      fireEvent.change(input, { target: { value: "Changed" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect((await screen.findByRole("alert")).textContent).toBe("You blocked this person.");
    });

    it("Cancel and Escape leave edit mode without calling the server", async () => {
      const input = await startEditing();
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByText("Editing message")).toBeNull();

      const menu = openMenuFor("My recent message");
      fireEvent.click(within(menu).getByRole("menuitem", { name: /Edit/ }));
      fireEvent.keyDown(screen.getByRole("textbox", { name: "Edit message text" }), { key: "Escape" });
      expect(screen.queryByText("Editing message")).toBeNull();
      expect(input).toBeTruthy();
      expect(vi.mocked(editMessage)).not.toHaveBeenCalled();
    });
  });

  describe("delete for me and delete for everyone", () => {
    it("own message: Delete opens a choice with both options and Cancel", async () => {
      await surface.open();
      const menu = openMenuFor("My recent message");
      fireEvent.click(within(menu).getByRole("menuitem", { name: /^Delete$/ }));

      const dialog = screen.getByRole("dialog", { name: "Delete message" });
      expect(within(dialog).getByText("Choose who this message is deleted for.")).toBeTruthy();
      expect(within(dialog).getByRole("button", { name: "Delete for me" })).toBeTruthy();
      expect(within(dialog).getByText("Removes it from your chat only. Matthew can still see it.")).toBeTruthy();
      expect(within(dialog).getByRole("button", { name: "Delete for everyone" })).toBeTruthy();
      expect(
        within(dialog).getByText("Replaces it with “This message was deleted” for both of you."),
      ).toBeTruthy();
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(vi.mocked(deleteMessage)).not.toHaveBeenCalled();
    });

    it("their message: the choice offers only Delete for me", async () => {
      await surface.open();
      const menu = openMenuFor("Their message");
      fireEvent.click(within(menu).getByRole("menuitem", { name: /Delete for me/ }));

      const dialog = screen.getByRole("dialog", { name: "Delete message" });
      expect(within(dialog).getByText("You can delete this message for yourself.")).toBeTruthy();
      expect(within(dialog).getByText("Removes it from your chat only. Matthew keeps it.")).toBeTruthy();
      expect(within(dialog).queryByRole("button", { name: "Delete for everyone" })).toBeNull();
    });

    it("Delete for me: confirms, calls scope=me and the message leaves the list without a reload", async () => {
      await surface.open();
      vi.mocked(deleteMessage).mockResolvedValue(undefined);
      const menu = openMenuFor("Their message");
      fireEvent.click(within(menu).getByRole("menuitem", { name: /Delete for me/ }));
      fireEvent.click(screen.getByRole("button", { name: "Delete for me" }));

      const confirm = screen.getByRole("dialog", { name: "Delete for me?" });
      expect(within(confirm).getByText("This message will disappear from your chat. Matthew will still see it.")).toBeTruthy();
      fireEvent.click(within(confirm).getByRole("button", { name: "Delete for me" }));

      await waitFor(() => expect(screen.queryByText("Their message")).toBeNull());
      expect(vi.mocked(deleteMessage)).toHaveBeenCalledWith(TOKEN, "c1", "m-theirs", "me");
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(vi.mocked(getMessages)).toHaveBeenCalledTimes(1);
    });

    it("Delete for everyone: the confirmation carries the tagged retention line; confirming leaves the placeholder in place", async () => {
      await surface.open();
      vi.mocked(deleteMessage).mockResolvedValue(undefined);
      const menu = openMenuFor("My recent message");
      fireEvent.click(within(menu).getByRole("menuitem", { name: /^Delete$/ }));
      fireEvent.click(screen.getByRole("button", { name: "Delete for everyone" }));

      const confirm = screen.getByRole("dialog", { name: "Delete for everyone?" });
      expect(
        within(confirm).getByText(
          "This message will be replaced with “This message was deleted” for you and Matthew. This can’t be undone.",
        ),
      ).toBeTruthy();
      expect(
        within(confirm).getByText(
          "We may keep a copy of the original for safety and legal reasons. [COPY PENDING LEGAL REVIEW]",
        ),
      ).toBeTruthy();
      // No promise of erasure anywhere in the dialog.
      expect(confirm.textContent).not.toMatch(/permanently|erase|remove(d)? from our/i);
      fireEvent.click(within(confirm).getByRole("button", { name: "Delete for everyone" }));

      await screen.findByText("This message was deleted");
      expect(vi.mocked(deleteMessage)).toHaveBeenCalledWith(TOKEN, "c1", "m-mine", "everyone");
      expect(screen.queryByText("My recent message")).toBeNull();
      // The placeholder has no menu of its own.
      expect(screen.getByText("This message was deleted").closest(".msg-host")).toBeNull();
    });

    it("deleting: both buttons are disabled, it says Deleting…, and Escape does not close it", async () => {
      await surface.open();
      const pending = deferred<undefined>();
      vi.mocked(deleteMessage).mockReturnValue(pending.promise);
      const menu = openMenuFor("My recent message");
      fireEvent.click(within(menu).getByRole("menuitem", { name: /^Delete$/ }));
      fireEvent.click(screen.getByRole("button", { name: "Delete for everyone" }));
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete for everyone" }));

      const deleting = await screen.findByRole("button", { name: "Deleting…" });
      expect((deleting as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(vi.mocked(deleteMessage)).toHaveBeenCalledTimes(1);

      await act(async () => {
        pending.resolve(undefined);
      });
      await screen.findByText("This message was deleted");
    });

    it("a failed delete shows the error with Try again, and Try again works", async () => {
      await surface.open();
      vi.mocked(deleteMessage).mockRejectedValueOnce(new MessagingApiError("x"));
      const menu = openMenuFor("My recent message");
      fireEvent.click(within(menu).getByRole("menuitem", { name: /^Delete$/ }));
      fireEvent.click(screen.getByRole("button", { name: "Delete for me" }));
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete for me" }));

      expect((await screen.findByRole("alert")).textContent).toBe(
        "Couldn’t delete the message. Check your connection and try again.",
      );
      expect(screen.getByText("My recent message")).toBeTruthy();

      vi.mocked(deleteMessage).mockResolvedValueOnce(undefined);
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      await waitFor(() => expect(screen.queryByText("My recent message")).toBeNull());
      expect(vi.mocked(deleteMessage)).toHaveBeenCalledTimes(2);
    });

    it("message_delete_not_sender is told apart by code", async () => {
      await surface.open();
      vi.mocked(deleteMessage).mockRejectedValueOnce(
        new MessagingApiError("whatever the server says", { status: 403, code: "message_delete_not_sender" }),
      );
      const menu = openMenuFor("My recent message");
      fireEvent.click(within(menu).getByRole("menuitem", { name: /^Delete$/ }));
      fireEvent.click(screen.getByRole("button", { name: "Delete for everyone" }));
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete for everyone" }));
      expect((await screen.findByRole("alert")).textContent).toBe(
        "Only the sender can delete a message for everyone.",
      );
    });

    it("the dialog holds focus: Tab wraps inside it and Escape restores focus to the button that opened it", async () => {
      await surface.open();
      const menu = openMenuFor("My recent message");
      fireEvent.click(within(menu).getByRole("menuitem", { name: /^Delete$/ }));
      const dialog = screen.getByRole("dialog");
      const cancel = within(dialog).getByRole("button", { name: "Cancel" });
      cancel.focus();
      fireEvent.keyDown(cancel, { key: "Tab" });
      expect(dialog.contains(document.activeElement)).toBe(true);
      expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Delete for me" }));

      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(optionsFor("My recent message"));
    });
  });

  describe("what the server sends", () => {
    it("a message deleted for everyone arrives as the placeholder, for me and for them, with no menu", async () => {
      const gone: DeletedMessage = {
        id: "m-gone",
        conversationId: "c1",
        senderId: OTHER,
        sentAt: ago(20),
        editedAt: null,
        deletedForEveryone: true,
        contentText: null,
      };
      const goneMine: DeletedMessage = { ...gone, id: "m-gone-mine", senderId: ME, sentAt: ago(10) };
      serve([THEIRS, gone, goneMine, MINE]);
      await surface.open();
      expect(screen.getAllByText("This message was deleted")).toHaveLength(2);
      expect(screen.getAllByRole("button", { name: "Message options" })).toHaveLength(2); // THEIRS and MINE only
    });

    it("an edited message from the server shows the Edited label", async () => {
      serve([THEIRS, MINE_OLD, { ...MINE, editedAt: ago(1) }]);
      await surface.open();
      expect(screen.getByText(surface.editedPattern)).toBeTruthy();
    });
  });

  describe("the conversation menu", () => {
    function openConversationMenu() {
      fireEvent.click(screen.getByRole("button", { name: "Conversation options" }));
      return screen.getByRole("menu", { name: "Conversation actions" });
    }

    it("lists Mark as Read, View User Profile, Block User and Delete Chat with its hint", async () => {
      await surface.open();
      const menu = openConversationMenu();
      expect(within(menu).getByRole("menuitem", { name: "Mark as Read" })).toBeTruthy();
      expect(within(menu).getByRole("menuitem", { name: "View User Profile" })).toBeTruthy();
      expect(within(menu).getByRole("menuitem", { name: "Block User" })).toBeTruthy();
      expect(within(menu).getByRole("menuitem", { name: /Delete Chat/ })).toBeTruthy();
      expect(within(menu).getByText("Removes the chat for you only")).toBeTruthy();
    });

    it("Mark as Read calls the read endpoint and says so", async () => {
      await surface.open();
      vi.mocked(markConversationRead).mockClear();
      fireEvent.click(within(openConversationMenu()).getByRole("menuitem", { name: "Mark as Read" }));
      expect(await screen.findByText("Marked as read.")).toBeTruthy();
      expect(vi.mocked(markConversationRead)).toHaveBeenCalledWith(TOKEN, "c1");
    });

    it("View User Profile goes to the other person's profile", async () => {
      await surface.open();
      fireEvent.click(within(openConversationMenu()).getByRole("menuitem", { name: "View User Profile" }));
      expect(await screen.findByText("Profile page")).toBeTruthy();
      expect(screen.getByTestId("where").textContent).toBe(`/users/${OTHER}`);
    });

    it("Block User opens the existing block dialog and blocking calls the users API for that person", async () => {
      await surface.open();
      vi.mocked(blockUser).mockResolvedValue(undefined);
      fireEvent.click(within(openConversationMenu()).getByRole("menuitem", { name: "Block User" }));

      const dialog = screen.getByRole("dialog", { name: "Block Matthew Amuloko?" });
      expect(within(dialog).getByText(/stops messages in both directions/)).toBeTruthy();
      fireEvent.click(within(dialog).getByRole("button", { name: "Block" }));
      await waitFor(() => expect(vi.mocked(blockUser)).toHaveBeenCalledWith(TOKEN, OTHER, ""));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(screen.getByText("Blocked.")).toBeTruthy();
    });

    it("Delete Chat asks first, with the for-you-only wording, and Cancel does nothing", async () => {
      await surface.open();
      fireEvent.click(within(openConversationMenu()).getByRole("menuitem", { name: /Delete Chat/ }));
      const dialog = screen.getByRole("dialog", { name: "Delete this chat?" });
      expect(
        within(dialog).getByText(
          "This removes the conversation for you only. Matthew keeps their copy. If they message you again, the chat comes back with only the new messages.",
        ),
      ).toBeTruthy();
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(vi.mocked(deleteConversation)).not.toHaveBeenCalled();
    });

    it("Delete chat: shows Deleting…, then a failure with Try again, then succeeds", async () => {
      await surface.open();
      const pending = deferred<undefined>();
      vi.mocked(deleteConversation).mockReturnValueOnce(pending.promise);
      fireEvent.click(within(openConversationMenu()).getByRole("menuitem", { name: /Delete Chat/ }));
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete chat" }));

      const deleting = await screen.findByRole("button", { name: "Deleting…" });
      expect((deleting as HTMLButtonElement).disabled).toBe(true);
      await act(async () => {
        pending.reject(new MessagingApiError("x"));
      });
      expect((await screen.findByRole("alert")).textContent).toBe(
        "Couldn’t delete the chat. Check your connection and try again.",
      );

      vi.mocked(deleteConversation).mockResolvedValueOnce(undefined);
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      await waitFor(() => expect(vi.mocked(deleteConversation)).toHaveBeenCalledTimes(2));
      expect(vi.mocked(deleteConversation)).toHaveBeenLastCalledWith(TOKEN, "c1");
    });
  });
});

describe("a deleted chat leaves the surface that showed it", () => {
  it("mobile page: goes back to the inbox", async () => {
    serve([THEIRS, MINE]);
    await mobilePage.open();
    vi.mocked(deleteConversation).mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Conversation options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete Chat/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete chat" }));
    expect(await screen.findByText("Inbox page")).toBeTruthy();
    expect(screen.getByTestId("where").textContent).toBe("/messages");
  });

  it("Community pop-up: the chat closes and the conversation leaves the sidebar", async () => {
    serve([THEIRS, MINE]);
    await popUp.open();
    vi.mocked(deleteConversation).mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Conversation options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete Chat/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete chat" }));
    await waitFor(() => expect(screen.queryByText("My recent message")).toBeNull());
    expect(screen.queryByText("Matthew Amuloko")).toBeNull();
    expect(screen.getByText("You don’t have any messages yet")).toBeTruthy();
  });
});

describe("the Community sidebar follows edits and deletes", () => {
  beforeEach(() => {
    serve([THEIRS, MINE_OLD, MINE]);
  });

  it("an edit of the last message updates the row's preview, and the row keeps its place", async () => {
    await popUp.open();
    vi.mocked(editMessage).mockResolvedValue({ id: "m-mine", contentText: "Edited preview", editedAt: new Date().toISOString() });
    const menu = openMenuFor("My recent message");
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Edit/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit message text" }), { target: { value: "Edited preview" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("You: Edited preview")).toBeTruthy();
  });

  it("deleting the last message for everyone moves the preview to the one before it", async () => {
    await popUp.open();
    vi.mocked(deleteMessage).mockResolvedValue(undefined);
    const menu = openMenuFor("My recent message");
    fireEvent.click(within(menu).getByRole("menuitem", { name: /^Delete$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Delete for everyone" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete for everyone" }));
    // The newest live message is now "My older message", sent by me.
    expect(await screen.findByText("You: My older message")).toBeTruthy();
  });

  it("opening a chat does not rewrite the preview", async () => {
    await popUp.open();
    expect(screen.getByText("You: My recent message")).toBeTruthy();
  });
});
