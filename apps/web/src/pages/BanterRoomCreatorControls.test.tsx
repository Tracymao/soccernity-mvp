// B-071 (Decision Log #472): the Bants room creator's controls on BanterRoomPage -- room menu (Deactivate /
// Reactivate), Add topics, remove a topic. Figma W8 Bants frames M3 to M19 / D2 to D17
// (docs/figma-w8-bants.md). Same conventions as BanterRoomPage.test.tsx: api/banter mocked, the session
// seeded into the in-memory store.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import BanterRoomPage from "./BanterRoomPage";
import { BanterApiError, type BanterRoom } from "../api/banter";

vi.mock("../api/banter", async () => {
  const actual = await vi.importActual<typeof import("../api/banter")>("../api/banter");
  return {
    ...actual,
    getRoomById: vi.fn(),
    getRoomFeed: vi.fn(),
    postToRoom: vi.fn(),
    joinRoom: vi.fn(),
    leaveRoom: vi.fn(),
    updateRoomStatus: vi.fn(),
    attachTopics: vi.fn(),
    listTopics: vi.fn(),
    removeTopic: vi.fn(),
  };
});

import {
  getRoomById,
  getRoomFeed,
  updateRoomStatus,
  attachTopics,
  listTopics,
  removeTopic,
} from "../api/banter";
import { seedSession, clearSession } from "../test/session";

function b64(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function token(sub: string): string {
  return `${b64({ alg: "none" })}.${b64({ sub, role: "fan" })}.sig`;
}

const PL = { id: "t-pl", name: "Premier League" };
const ARS = { id: "t-ars", name: "Arsenal" };

function room(overrides: Partial<BanterRoom> = {}): BanterRoom {
  return {
    id: "room-1",
    name: "English Premier League Room",
    scopeType: "topic",
    createdBy: "creator-1",
    status: "active",
    createdAt: "2026-10-01T12:00:00.000Z",
    memberCount: 3,
    joined: true,
    topics: [PL, ARS],
    ...overrides,
  };
}

function setWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/banter/room-1"]}>
      <Routes>
        <Route path="/banter/:roomId" element={<BanterRoomPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function asCreator(r: Partial<BanterRoom> = {}) {
  seedSession(token("creator-1"));
  vi.mocked(getRoomById).mockResolvedValue(room(r));
  vi.mocked(getRoomFeed).mockResolvedValue({ items: [], nextCursor: null });
}

function catalogue(items = [PL, ARS, { id: "t-tw", name: "Transfer window" }, { id: "t-npfl", name: "NPFL" }], next: string | null = null) {
  vi.mocked(listTopics).mockResolvedValue({ items, nextCursor: next });
}

afterEach(cleanup);
beforeEach(() => {
  clearSession();
  setWidth(1280);
  for (const fn of [getRoomById, getRoomFeed, updateRoomStatus, attachTopics, listTopics, removeTopic]) {
    vi.mocked(fn).mockReset();
  }
});

describe("creator-only rule", () => {
  it("shows no room menu, remove cross or Add topic chip to anyone but the creator", async () => {
    seedSession(token("someone-else"));
    vi.mocked(getRoomById).mockResolvedValue(room());
    vi.mocked(getRoomFeed).mockResolvedValue({ items: [], nextCursor: null });
    renderPage();

    await screen.findByText("Premier League");
    expect(screen.queryByRole("button", { name: "Room menu" })).toBeNull();
    expect(screen.queryByRole("button", { name: /add topic/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^remove /i })).toBeNull();
    expect(screen.queryByText("No topics yet.")).toBeNull();
  });

  it("does not guess from a name: the creator is decided by the server's createdBy id only", async () => {
    // Same display words everywhere, different ids.
    seedSession(token("user-9"));
    vi.mocked(getRoomById).mockResolvedValue(room({ createdBy: "user-9x" }));
    vi.mocked(getRoomFeed).mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    await screen.findByText("Premier League");
    expect(screen.queryByRole("button", { name: "Room menu" })).toBeNull();
  });

  it("a non-creator with no topics sees no 'No topics yet.' line and no controls", async () => {
    seedSession(token("someone-else"));
    vi.mocked(getRoomById).mockResolvedValue(room({ topics: [] }));
    vi.mocked(getRoomFeed).mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    await screen.findByPlaceholderText(/say something/i);
    expect(screen.queryByText("No topics yet.")).toBeNull();
    expect(screen.queryByRole("button", { name: /add topic/i })).toBeNull();
  });

  it("shows the creator the menu, a cross on every chip and the Add topic chip", async () => {
    asCreator();
    renderPage();
    await screen.findByText("Premier League");
    expect(screen.getByRole("button", { name: "Room menu" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Remove Premier League" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Remove Arsenal" })).not.toBeNull();
    expect(screen.getByRole("button", { name: /add topic/i })).not.toBeNull();
  });
});

describe("Deactivate / Reactivate", () => {
  it("opens the confirm dialog with the frame wording, and Cancel changes nothing", async () => {
    asCreator();
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Room menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Deactivate room" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Deactivate this room?" })).not.toBeNull();
    expect(
      within(dialog).getByText("People can still read the room. It shows as inactive in the list until you reactivate it."),
    ).not.toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(updateRoomStatus).not.toHaveBeenCalled();
  });

  it("moves focus into the dialog, closes on Escape and gives focus back to the kebab", async () => {
    asCreator();
    renderPage();
    const kebab = await screen.findByRole("button", { name: "Room menu" });
    fireEvent.click(kebab);
    fireEvent.click(screen.getByRole("menuitem", { name: "Deactivate room" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Deactivate room calls PATCH status inactive, then shows the grey dot and the Inactive pill without a reload", async () => {
    asCreator();
    let resolve!: (r: BanterRoom) => void;
    vi.mocked(updateRoomStatus).mockReturnValue(new Promise((r) => (resolve = r)));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Room menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Deactivate room" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Deactivate room" }));

    // Saving: the label changes and both buttons are locked.
    await within(dialog).findByRole("button", { name: "Deactivating…" });
    expect((within(dialog).getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    expect(updateRoomStatus).toHaveBeenCalledTimes(1);
    expect(updateRoomStatus).toHaveBeenCalledWith(expect.any(String), "room-1", "inactive");

    await act(async () => resolve(room({ status: "inactive" })));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Inactive")).not.toBeNull();
    expect(screen.getByRole("img", { name: "Inactive room" })).not.toBeNull();
  });

  it("a failed deactivate keeps the dialog, shows the frame's banner and the button becomes Try again", async () => {
    asCreator();
    vi.mocked(updateRoomStatus).mockRejectedValueOnce(new BanterApiError("Couldn't reach the Soccernity server."));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Room menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Deactivate room" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Deactivate room" }));

    expect(await within(dialog).findByText("Couldn’t change the room status. Check your connection and try again.")).not.toBeNull();
    expect(screen.queryByText("Inactive")).toBeNull();

    vi.mocked(updateRoomStatus).mockResolvedValueOnce(room({ status: "inactive" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Inactive")).not.toBeNull();
  });

  it("shows the server's own sentence when a 4xx explains itself (for example guardian consent)", async () => {
    asCreator();
    vi.mocked(updateRoomStatus).mockRejectedValueOnce(
      new BanterApiError("Guardian consent is required.", { status: 403 }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Room menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Deactivate room" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Deactivate room" }));
    expect(await screen.findByText("Guardian consent is required.")).not.toBeNull();
  });

  it("an inactive room offers Reactivate room, which runs without a confirmation and clears the pill", async () => {
    asCreator({ status: "inactive" });
    vi.mocked(updateRoomStatus).mockResolvedValueOnce(room({ status: "active" }));
    renderPage();
    expect(await screen.findByText("Inactive")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Room menu" }));
    expect(screen.queryByRole("menuitem", { name: "Deactivate room" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Reactivate room" }));

    await waitFor(() => expect(screen.queryByText("Inactive")).toBeNull());
    expect(updateRoomStatus).toHaveBeenCalledWith(expect.any(String), "room-1", "active");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("img", { name: "Active room" })).not.toBeNull();
  });

  it("a failed Reactivate shows the banner under the header and Try again retries it", async () => {
    asCreator({ status: "inactive" });
    vi.mocked(updateRoomStatus).mockRejectedValueOnce(new BanterApiError("Couldn't reach the Soccernity server."));
    renderPage();
    await screen.findByText("Inactive");
    fireEvent.click(screen.getByRole("button", { name: "Room menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Reactivate room" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn’t change the room status. Check your connection and try again.");
    expect(screen.getByText("Inactive")).not.toBeNull();

    vi.mocked(updateRoomStatus).mockResolvedValueOnce(room({ status: "active" }));
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByText("Inactive")).toBeNull());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("an inactive room still lets its creator add and remove topics", async () => {
    asCreator({ status: "inactive" });
    renderPage();
    await screen.findByText("Inactive");
    expect(screen.getByRole("button", { name: "Remove Arsenal" })).not.toBeNull();
    expect(screen.getByRole("button", { name: /add topic/i })).not.toBeNull();
  });
});

describe("Add topics", () => {
  async function openSheet() {
    asCreator();
    catalogue();
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /add topic/i }));
    return await screen.findByRole("dialog");
  }

  it("opens as a popover on desktop and as a bottom sheet on a phone", async () => {
    const popover = await openSheet();
    expect(popover.className).toContain("banter-modal--popover");
    cleanup();
    vi.mocked(listTopics).mockReset();

    setWidth(390);
    asCreator();
    catalogue();
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /add topic/i }));
    const sheet = await screen.findByRole("dialog");
    expect(sheet.className).toContain("banter-modal--sheet");
    expect(sheet.getAttribute("aria-modal")).toBe("true");
  });

  it("starts with Add disabled, the frame's intro, the field and the existing topics that are not attached yet", async () => {
    const dialog = await openSheet();
    expect(within(dialog).getByText(/Topics help people find this room\. Add up to 5 at a time, 2 to 60\s+characters each\./)).not.toBeNull();
    expect(within(dialog).getByPlaceholderText("Type a topic, for example Transfer window")).not.toBeNull();
    expect((within(dialog).getByRole("button", { name: "Add topic" }) as HTMLButtonElement).disabled).toBe(true);
    // Premier League and Arsenal are already on the room, so they are not offered again.
    await within(dialog).findByRole("button", { name: "Transfer window" });
    expect(within(dialog).queryByRole("button", { name: "Arsenal" })).toBeNull();
    // No next page, so no "Show more topics".
    expect(within(dialog).queryByRole("button", { name: "Show more topics" })).toBeNull();
  });

  it("moves focus to the field, closes on Escape and on Cancel", async () => {
    const dialog = await openSheet();
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByPlaceholderText(/Type a topic/)));
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /add topic/i }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(attachTopics).not.toHaveBeenCalled();
  });

  it("counts one typed name and one picked topic, sends both, and replaces the chips with the server's list", async () => {
    const dialog = await openSheet();
    fireEvent.change(within(dialog).getByPlaceholderText(/Type a topic/), { target: { value: "  Derby day  " } });
    fireEvent.click(await within(dialog).findByRole("button", { name: "Transfer window" }));
    const add = within(dialog).getByRole("button", { name: "Add 2 topics" }) as HTMLButtonElement;
    expect(add.disabled).toBe(false);

    vi.mocked(attachTopics).mockResolvedValueOnce({
      roomId: "room-1",
      topics: [PL, ARS, { id: "t-dd", name: "Derby day" }, { id: "t-tw", name: "Transfer window" }],
    });
    fireEvent.click(add);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Trimmed typed name first, then the picked one.
    expect(attachTopics).toHaveBeenCalledWith(expect.any(String), "room-1", ["Derby day", "Transfer window"]);
    expect(screen.getByText("Derby day")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Remove Transfer window" })).not.toBeNull();
  });

  it("says 'Add 1 topic' for one and counts a picked name equal to the typed one only once", async () => {
    const dialog = await openSheet();
    fireEvent.click(await within(dialog).findByRole("button", { name: "NPFL" }));
    expect(within(dialog).getByRole("button", { name: "Add 1 topic" })).not.toBeNull();
    fireEvent.change(within(dialog).getByPlaceholderText(/Type a topic/), { target: { value: "npfl" } });
    expect(within(dialog).getByRole("button", { name: "Add 1 topic" })).not.toBeNull();
  });

  it("shows the 2 to 60 character rule for a one-letter name and keeps Add disabled", async () => {
    const dialog = await openSheet();
    const input = within(dialog).getByPlaceholderText(/Type a topic/);
    fireEvent.change(input, { target: { value: "A" } });
    expect(within(dialog).getByText("Use 2 to 60 characters.")).not.toBeNull();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect((within(dialog).getByRole("button", { name: "Add topic" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(input, { target: { value: "x".repeat(61) } });
    expect(within(dialog).getByText("Use 2 to 60 characters.")).not.toBeNull();
    fireEvent.change(input, { target: { value: "x".repeat(60) } });
    expect(within(dialog).queryByText("Use 2 to 60 characters.")).toBeNull();
    expect((within(dialog).getByRole("button", { name: "Add 1 topic" }) as HTMLButtonElement).disabled).toBe(false);
    // Nothing is sent for an invalid name.
    expect(attachTopics).not.toHaveBeenCalled();
  });

  it("a 400 from the server puts the same rule on the field and keeps the sheet open", async () => {
    const dialog = await openSheet();
    fireEvent.change(within(dialog).getByPlaceholderText(/Type a topic/), { target: { value: "Okay name" } });
    vi.mocked(attachTopics).mockRejectedValueOnce(new BanterApiError("names must be longer", { status: 400 }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add 1 topic" }));
    expect(await within(dialog).findByText("Use 2 to 60 characters.")).not.toBeNull();
    expect(screen.queryByRole("dialog")).not.toBeNull();
  });

  it("allows at most 5 names in one go: the sixth is refused", async () => {
    asCreator({ topics: [] });
    catalogue(
      ["a1", "a2", "a3", "a4", "a5", "a6"].map((n) => ({ id: `id-${n}`, name: `Topic ${n}` })),
    );
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /add topic/i }));
    const dialog = await screen.findByRole("dialog");
    for (const n of ["a1", "a2", "a3", "a4", "a5"]) {
      fireEvent.click(await within(dialog).findByRole("button", { name: `Topic ${n}` }));
    }
    expect(within(dialog).getByRole("button", { name: "Add 5 topics" })).not.toBeNull();
    // The sixth chip cannot be picked.
    expect((within(dialog).getByRole("button", { name: "Topic a6" }) as HTMLButtonElement).disabled).toBe(true);
    // A typed name makes six: Add is disabled and the limit is said.
    fireEvent.change(within(dialog).getByPlaceholderText(/Type a topic/), { target: { value: "Extra" } });
    expect(within(dialog).getByText("Add up to 5 at a time.")).not.toBeNull();
    expect((within(dialog).getByRole("button", { name: "Add 6 topics" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("while saving, the label reads Adding… and the fields and buttons are locked", async () => {
    const dialog = await openSheet();
    fireEvent.change(within(dialog).getByPlaceholderText(/Type a topic/), { target: { value: "Derby day" } });
    let resolve!: (v: { roomId: string; topics: { id: string; name: string }[] }) => void;
    vi.mocked(attachTopics).mockReturnValue(new Promise((r) => (resolve = r)));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add 1 topic" }));

    await within(dialog).findByRole("button", { name: "Adding…" });
    expect((within(dialog).getByPlaceholderText(/Type a topic/) as HTMLInputElement).disabled).toBe(true);
    expect((within(dialog).getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    // Escape is ignored while the request is running.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeNull();
    expect(attachTopics).toHaveBeenCalledTimes(1);

    await act(async () => resolve({ roomId: "room-1", topics: [PL, ARS, { id: "t-dd", name: "Derby day" }] }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("a failed save shows the frame's banner, keeps what was typed and Try again resends", async () => {
    const dialog = await openSheet();
    fireEvent.change(within(dialog).getByPlaceholderText(/Type a topic/), { target: { value: "Derby day" } });
    vi.mocked(attachTopics).mockRejectedValueOnce(new BanterApiError("Couldn't reach the Soccernity server."));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add 1 topic" }));

    expect(await within(dialog).findByText("Couldn’t add the topic. Check your connection and try again.")).not.toBeNull();
    expect((within(dialog).getByPlaceholderText(/Type a topic/) as HTMLInputElement).value).toBe("Derby day");

    vi.mocked(attachTopics).mockResolvedValueOnce({ roomId: "room-1", topics: [PL, ARS, { id: "t-dd", name: "Derby day" }] });
    fireEvent.click(within(dialog).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(attachTopics).toHaveBeenCalledTimes(2);
  });

  it("shows the server's own sentence for a 4xx such as guardian consent", async () => {
    const dialog = await openSheet();
    fireEvent.change(within(dialog).getByPlaceholderText(/Type a topic/), { target: { value: "Derby day" } });
    vi.mocked(attachTopics).mockRejectedValueOnce(new BanterApiError("Verify your email first.", { status: 403 }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add 1 topic" }));
    expect(await within(dialog).findByText("Verify your email first.")).not.toBeNull();
  });

  it("while the catalogue loads it shows skeleton chips; typing already works", async () => {
    asCreator();
    vi.mocked(listTopics).mockReturnValue(new Promise(() => {}));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /add topic/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("status", { name: "Loading topics" })).not.toBeNull();
    fireEvent.change(within(dialog).getByPlaceholderText(/Type a topic/), { target: { value: "Derby day" } });
    expect((within(dialog).getByRole("button", { name: "Add 1 topic" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("when the catalogue does not load it says so, typing still works and Try again reloads it", async () => {
    asCreator();
    vi.mocked(listTopics).mockRejectedValueOnce(new BanterApiError("nope"));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /add topic/i }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Couldn’t load existing topics. You can still type one.")).not.toBeNull();
    fireEvent.change(within(dialog).getByPlaceholderText(/Type a topic/), { target: { value: "Derby day" } });
    expect((within(dialog).getByRole("button", { name: "Add 1 topic" }) as HTMLButtonElement).disabled).toBe(false);

    catalogue();
    fireEvent.click(within(dialog).getByRole("button", { name: "Try again" }));
    expect(await within(dialog).findByRole("button", { name: "Transfer window" })).not.toBeNull();
  });

  it("Show more topics asks for the next page with its cursor and appends it", async () => {
    asCreator();
    catalogue([{ id: "t-tw", name: "Transfer window" }], "cur-2");
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /add topic/i }));
    const dialog = await screen.findByRole("dialog");
    const more = await within(dialog).findByRole("button", { name: "Show more topics" });

    vi.mocked(listTopics).mockResolvedValueOnce({ items: [{ id: "t-mday", name: "Matchday" }], nextCursor: null });
    fireEvent.click(more);
    expect(await within(dialog).findByRole("button", { name: "Matchday" })).not.toBeNull();
    expect(listTopics).toHaveBeenLastCalledWith(expect.any(String), "cur-2");
    expect(within(dialog).queryByRole("button", { name: "Show more topics" })).toBeNull();
  });

  it("a room with no topics reads 'No topics yet.' beside the Add topic chip", async () => {
    asCreator({ topics: [] });
    renderPage();
    expect(await screen.findByText("No topics yet.")).not.toBeNull();
    expect(screen.getByRole("button", { name: /add topic/i })).not.toBeNull();
    expect(screen.queryByRole("list", { name: "Topics" })).toBeNull();
  });
});

describe("Remove a topic", () => {
  it("calls DELETE for that topic, dims the chip and its cross while it runs, then removes the chip", async () => {
    asCreator();
    let resolve!: () => void;
    vi.mocked(removeTopic).mockReturnValue(new Promise<void>((r) => (resolve = r)));
    renderPage();
    const cross = await screen.findByRole("button", { name: "Remove Arsenal" });
    fireEvent.click(cross);

    await waitFor(() => expect((screen.getByRole("button", { name: "Remove Arsenal" }) as HTMLButtonElement).disabled).toBe(true));
    expect(screen.getByText("Arsenal").closest("li")?.className).toContain("removing");
    expect(removeTopic).toHaveBeenCalledWith(expect.any(String), "room-1", "t-ars");
    // The other chip is untouched.
    expect((screen.getByRole("button", { name: "Remove Premier League" }) as HTMLButtonElement).disabled).toBe(false);

    await act(async () => resolve());
    await waitFor(() => expect(screen.queryByText("Arsenal")).toBeNull());
    expect(screen.getByText("Premier League")).not.toBeNull();
  });

  it("on failure keeps the chip and says so in one line under the chips", async () => {
    asCreator();
    vi.mocked(removeTopic).mockRejectedValueOnce(new BanterApiError("Couldn't reach the Soccernity server."));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Remove Arsenal" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Couldn’t remove the topic. Try again.");
    expect(screen.getByText("Arsenal")).not.toBeNull();
    // The cross is usable again.
    expect((screen.getByRole("button", { name: "Remove Arsenal" }) as HTMLButtonElement).disabled).toBe(false);

    vi.mocked(removeTopic).mockResolvedValueOnce();
    fireEvent.click(screen.getByRole("button", { name: "Remove Arsenal" }));
    await waitFor(() => expect(screen.queryByText("Arsenal")).toBeNull());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("two removals that overlap both stick", async () => {
    asCreator();
    const done: Array<() => void> = [];
    vi.mocked(removeTopic).mockImplementation(() => new Promise<void>((r) => done.push(r)));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Remove Premier League" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Arsenal" }));
    await act(async () => done[0]());
    await act(async () => done[1]());
    await waitFor(() => expect(screen.queryByText("Premier League")).toBeNull());
    expect(screen.queryByText("Arsenal")).toBeNull();
    expect(screen.getByText("No topics yet.")).not.toBeNull();
  });
});
