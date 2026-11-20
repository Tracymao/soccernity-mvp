// "Create a topic" dialog (Figma pass Y). The API client and the club list are mocked; the dialog's behaviour
// (focus trap, Escape, disabled-until-title, scope and club rules, counter and limit, emoji insert at the
// caret, error line, success hand-off) is what is under test.
import { useState } from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CreateTopicDialog from "./CreateTopicDialog";
import type { BanterRoom } from "../../api/banter";
import type { ClubSummary } from "../../api/clubs";

vi.mock("../../api/banter", async () => {
  const actual = await vi.importActual<typeof import("../../api/banter")>("../../api/banter");
  return { ...actual, createRoom: vi.fn() };
});
vi.mock("../../api/clubs", async () => {
  const actual = await vi.importActual<typeof import("../../api/clubs")>("../../api/clubs");
  return { ...actual, listJoinedClubs: vi.fn() };
});

import { BANTER_ROOM_DESCRIPTION_MAX_LENGTH, BanterApiError, createRoom } from "../../api/banter";
import { listJoinedClubs } from "../../api/clubs";

const MAX = BANTER_ROOM_DESCRIPTION_MAX_LENGTH;

function room(overrides: Partial<BanterRoom> = {}): BanterRoom {
  return {
    id: "new-room",
    name: "Sunday League Talk",
    scopeType: "topic",
    createdBy: "user-1",
    status: "active",
    createdAt: "2026-11-14T12:00:00.000Z",
    memberCount: 1,
    joined: true,
    ...overrides,
  };
}
function club(overrides: Partial<ClubSummary> = {}): ClubSummary {
  return { id: "club-1", name: "Chelsea FC", league: "Premier League", country: "England", logoUrl: null, memberCount: 1, joined: true, ...overrides };
}

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(createRoom).mockReset();
  vi.mocked(listJoinedClubs).mockReset();
  vi.mocked(listJoinedClubs).mockResolvedValue([]);
});

function Host(props: { onCreated?: (r: BanterRoom) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        open dialog
      </button>
      {open && (
        <CreateTopicDialog
          accessToken="t"
          displayName="Temi Titiloye"
          onClose={() => setOpen(false)}
          onCreated={props.onCreated ?? (() => {})}
        />
      )}
    </div>
  );
}

function openDialog(props: { onCreated?: (r: BanterRoom) => void } = {}) {
  render(<Host {...props} />);
  const opener = screen.getByRole("button", { name: "open dialog" });
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

const title = () => screen.getByLabelText("Title") as HTMLInputElement;
const description = () => screen.getByLabelText("Description (optional)") as HTMLTextAreaElement;
const post = () => screen.getByRole("button", { name: /^(Post|Creating…)$/ }) as HTMLButtonElement;

describe("CreateTopicDialog", () => {
  it("opens as a labelled dialog titled 'Create a topic', with focus on the Title", () => {
    openDialog();
    const dialog = screen.getByRole("dialog", { name: "Create a topic" });
    expect(dialog).not.toBeNull();
    expect(document.activeElement).toBe(title());
    expect(screen.getByLabelText("Scope")).not.toBeNull();
    expect(description().placeholder).toBe("Description (optional)");
  });

  it("keeps Post disabled until a title is entered (whitespace does not count)", () => {
    openDialog();
    expect(post().disabled).toBe(true);
    fireEvent.change(title(), { target: { value: "   " } });
    expect(post().disabled).toBe(true);
    fireEvent.change(title(), { target: { value: "Derby day" } });
    expect(post().disabled).toBe(false);
  });

  it("traps Tab inside the dialog, both directions", () => {
    openDialog();
    const dialog = screen.getByRole("dialog", { name: "Create a topic" });
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'));
    // Post is disabled with no title: type one so it is part of the loop.
    fireEvent.change(title(), { target: { value: "Derby day" } });
    const loop = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]'));
    expect(loop.length).toBeGreaterThan(3);
    expect(focusable.length).toBeGreaterThan(0);
    const last = loop[loop.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(loop[0]);
    loop[0].focus();
    fireEvent.keyDown(loop[0], { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("Escape closes it and focus goes back to the opener", () => {
    const opener = openDialog();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("the X closes it and focus goes back to the opener", () => {
    const opener = openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  describe("scope and club", () => {
    it("Topic is the default and the Club option is disabled with no club, with the reason shown", async () => {
      openDialog();
      expect((screen.getByLabelText("Scope") as HTMLSelectElement).value).toBe("topic");
      expect(await screen.findByText(/join a club to create one/i)).not.toBeNull();
      expect((screen.getByRole("option", { name: "Club" }) as HTMLOptionElement).disabled).toBe(true);
      expect(screen.queryByLabelText("Club")).toBeNull();
    });

    it("Club is disabled while memberships load", async () => {
      vi.mocked(listJoinedClubs).mockReturnValueOnce(new Promise<ClubSummary[]>(() => {}));
      openDialog();
      expect(await screen.findByText(/checking your club memberships/i)).not.toBeNull();
      expect((screen.getByRole("option", { name: "Club" }) as HTMLOptionElement).disabled).toBe(true);
    });

    it("a membership lookup failure disables Club and offers Try again", async () => {
      vi.mocked(listJoinedClubs).mockRejectedValueOnce(new Error("down"));
      openDialog();
      expect(await screen.findByText(/couldn.t check your club memberships/i)).not.toBeNull();
      expect((screen.getByRole("option", { name: "Club" }) as HTMLOptionElement).disabled).toBe(true);
      vi.mocked(listJoinedClubs).mockResolvedValueOnce([club()]);
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      await waitFor(() => expect((screen.getByRole("option", { name: "Club" }) as HTMLOptionElement).disabled).toBe(false));
    });

    it("choosing Club shows the club select and sends scopeRef", async () => {
      vi.mocked(listJoinedClubs).mockResolvedValueOnce([club({ id: "c1", name: "Chelsea FC" }), club({ id: "c2", name: "Arsenal" })]);
      vi.mocked(createRoom).mockResolvedValueOnce(room({ scopeType: "club" }));
      openDialog();
      await waitFor(() => expect((screen.getByRole("option", { name: "Club" }) as HTMLOptionElement).disabled).toBe(false));
      fireEvent.change(screen.getByLabelText("Scope"), { target: { value: "club" } });
      expect((screen.getByLabelText("Club") as HTMLSelectElement).value).toBe("c1");
      fireEvent.change(screen.getByLabelText("Club"), { target: { value: "c2" } });
      fireEvent.change(title(), { target: { value: "Matchday" } });
      fireEvent.click(post());
      await waitFor(() =>
        expect(createRoom).toHaveBeenCalledWith("t", { name: "Matchday", scopeType: "club", scopeRef: "c2" }),
      );
    });

    it("never sends scopeRef for another scope", async () => {
      vi.mocked(listJoinedClubs).mockResolvedValueOnce([club()]);
      vi.mocked(createRoom).mockResolvedValueOnce(room({ scopeType: "league" }));
      openDialog();
      await waitFor(() => expect((screen.getByRole("option", { name: "Club" }) as HTMLOptionElement).disabled).toBe(false));
      fireEvent.change(screen.getByLabelText("Scope"), { target: { value: "league" } });
      fireEvent.change(title(), { target: { value: "NPFL talk" } });
      fireEvent.click(post());
      await waitFor(() => expect(createRoom).toHaveBeenCalledWith("t", { name: "NPFL talk", scopeType: "league" }));
    });
  });

  describe("description and the limit", () => {
    it("counts characters against the shared API limit", () => {
      openDialog();
      expect(screen.getByText(`0 / ${MAX}`)).not.toBeNull();
      fireEvent.change(description(), { target: { value: "hello" } });
      expect(screen.getByText(`5 / ${MAX}`)).not.toBeNull();
      expect(description().maxLength).toBe(MAX);
    });

    it("sends the description trimmed, and leaves it out when blank", async () => {
      vi.mocked(createRoom).mockResolvedValue(room());
      openDialog();
      fireEvent.change(title(), { target: { value: "Derby day" } });
      fireEvent.change(description(), { target: { value: "   " } });
      fireEvent.click(post());
      await waitFor(() => expect(createRoom).toHaveBeenCalledTimes(1));
      expect(vi.mocked(createRoom).mock.calls[0][1]).toEqual({ name: "Derby day", scopeType: "topic" });
      cleanup();
      vi.mocked(createRoom).mockClear();

      openDialog();
      fireEvent.change(title(), { target: { value: "Derby day" } });
      fireEvent.change(description(), { target: { value: "  Who wins?  " } });
      fireEvent.click(post());
      await waitFor(() => expect(createRoom).toHaveBeenCalledTimes(1));
      expect(vi.mocked(createRoom).mock.calls[0][1]).toEqual({ name: "Derby day", scopeType: "topic", description: "Who wins?" });
    });
  });

  describe("emoji", () => {
    function openPicker() {
      fireEvent.click(screen.getByRole("button", { name: "Emoji", expanded: false }));
      return screen.getByRole("group", { name: "Emoji" });
    }

    it("inserts at the caret, replaces a selection, and closes after choosing", async () => {
      openDialog();
      fireEvent.change(description(), { target: { value: "Big match tonight" } });
      description().setSelectionRange(3, 3);
      openPicker();
      fireEvent.click(screen.getByRole("button", { name: "soccer ball" }));
      await waitFor(() => expect(description().value).toBe("Big⚽ match tonight"));
      expect(screen.queryByRole("group", { name: "Emoji" })).toBeNull();
      await waitFor(() => expect(document.activeElement).toBe(description()));

      description().setSelectionRange(0, 3);
      openPicker();
      fireEvent.click(screen.getByRole("button", { name: "fire" }));
      await waitFor(() => expect(description().value).toBe("🔥⚽ match tonight"));
    });

    it("Shift-click keeps the picker open so several can be added", async () => {
      openDialog();
      description().setSelectionRange(0, 0);
      openPicker();
      fireEvent.click(screen.getByRole("button", { name: "soccer ball" }), { shiftKey: true });
      await waitFor(() => expect(description().value).toBe("⚽"));
      expect(screen.getByRole("group", { name: "Emoji" })).not.toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "trophy" }), { shiftKey: true });
      await waitFor(() => expect(description().value).toBe("⚽🏆"));
    });

    it("Escape in the picker closes only the picker and returns focus to the emoji button", () => {
      openDialog();
      const group = openPicker();
      fireEvent.keyDown(group, { key: "Escape" });
      expect(screen.queryByRole("group", { name: "Emoji" })).toBeNull();
      expect(screen.getByRole("dialog", { name: "Create a topic" })).not.toBeNull();
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Emoji" }));
    });

    it("cannot push the description over the limit: an emoji that does not fit is ignored", async () => {
      openDialog();
      // 499 characters leaves one unit: a two-unit emoji must not be inserted, a one-unit one may be.
      fireEvent.change(description(), { target: { value: "a".repeat(MAX - 1) } });
      description().setSelectionRange(MAX - 1, MAX - 1);
      openPicker();
      fireEvent.click(screen.getByRole("button", { name: "grinning face" }));
      expect(description().value.length).toBe(MAX - 1);
      fireEvent.click(screen.getByRole("button", { name: "soccer ball" }));
      await waitFor(() => expect(description().value.length).toBe(MAX));
      expect(screen.getByText(`${MAX} / ${MAX}`)).not.toBeNull();
    });
  });

  describe("submit", () => {
    it("shows a pending state while creating and hands the new room to onCreated", async () => {
      let resolve!: (r: BanterRoom) => void;
      vi.mocked(createRoom).mockReturnValueOnce(new Promise<BanterRoom>((r) => (resolve = r)));
      const onCreated = vi.fn();
      openDialog({ onCreated });
      fireEvent.change(title(), { target: { value: "Sunday League Talk" } });
      fireEvent.click(post());
      await waitFor(() => expect(post().textContent).toBe("Creating…"));
      expect(post().disabled).toBe(true);
      // Busy: the X and Escape do nothing.
      expect((screen.getByRole("button", { name: "Close" }) as HTMLButtonElement).disabled).toBe(true);
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.getByRole("dialog")).not.toBeNull();
      resolve(room());
      await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: "new-room" })));
    });

    it("shows the server's own message inside the dialog and keeps what was typed", async () => {
      vi.mocked(createRoom).mockRejectedValueOnce(new BanterApiError("A Banter Room with this name already exists", { status: 409 }));
      openDialog();
      fireEvent.change(title(), { target: { value: "Sunday League Talk" } });
      fireEvent.change(description(), { target: { value: "keep me" } });
      fireEvent.click(post());
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("already exists");
      expect(title().value).toBe("Sunday League Talk");
      expect(description().value).toBe("keep me");
      expect(post().disabled).toBe(false);
    });

    it("shows a plain line when the failure is not an API error", async () => {
      vi.mocked(createRoom).mockRejectedValueOnce(new Error("boom"));
      openDialog();
      fireEvent.change(title(), { target: { value: "Derby day" } });
      fireEvent.click(post());
      expect((await screen.findByRole("alert")).textContent).toBe("Couldn't create that room.");
    });
  });
});
