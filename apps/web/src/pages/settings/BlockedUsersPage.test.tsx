import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import BlockedUsersPage from "./BlockedUsersPage";
import { UsersApiError } from "../../api/users";

vi.mock("../../api/users", async () => {
  const actual = await vi.importActual<typeof import("../../api/users")>("../../api/users");
  return { ...actual, getBlockedUsers: vi.fn(), unblockUser: vi.fn() };
});
import { getBlockedUsers, unblockUser } from "../../api/users";
import { seedSession, clearSession } from "../../test/session";

function b64(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const TOKEN = `${b64({ alg: "none" })}.${b64({ sub: "me", role: "fan" })}.sig`;

afterEach(cleanup);
beforeEach(() => {
  clearSession();
  seedSession(TOKEN);
  vi.mocked(getBlockedUsers).mockReset();
  vi.mocked(unblockUser).mockReset();
});

function renderPage() {
  render(
    <MemoryRouter>
      <BlockedUsersPage />
    </MemoryRouter>,
  );
}

describe("BlockedUsersPage", () => {
  it("prompts to log in and calls nothing with no session", () => {
    clearSession();
    renderPage();
    expect(screen.getByText(/log in to manage blocked users/i)).not.toBeNull();
    expect(getBlockedUsers).not.toHaveBeenCalled();
  });

  it("lists blocked users with their private reason and no date", async () => {
    vi.mocked(getBlockedUsers).mockResolvedValue({
      items: [{ id: "u2", publicName: "tobi_9", reason: "spam" }],
      nextCursor: null,
    });
    renderPage();
    await screen.findByText("tobi_9");
    expect(screen.getByText("Reason: spam")).not.toBeNull();
    expect(getBlockedUsers).toHaveBeenCalledWith(expect.any(String), "me", undefined);
  });

  it("each row shows the public name once, with a one-letter avatar and no @handle line (K10, Decision Log #415 item 3)", async () => {
    vi.mocked(getBlockedUsers).mockResolvedValue({
      items: [{ id: "u2", publicName: "tobi_9", reason: null }],
      nextCursor: null,
    });
    renderPage();
    const name = await screen.findByText("tobi_9");
    const row = name.closest("li") as HTMLElement;
    expect(row.textContent).toBe("Ttobi_9Unblock");
    expect(row.textContent).not.toContain("@");
    expect(row.querySelectorAll(".blocked-users__name")).toHaveLength(1);
  });

  it("empty state", async () => {
    vi.mocked(getBlockedUsers).mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    await screen.findByText("No blocked users");
  });

  it("load error", async () => {
    vi.mocked(getBlockedUsers).mockRejectedValue(new UsersApiError("Couldn't load your blocked users (500)."));
    renderPage();
    expect((await screen.findByRole("alert")).textContent).toMatch(/blocked users/);
  });

  it("Load more appends the next page by cursor", async () => {
    vi.mocked(getBlockedUsers)
      .mockResolvedValueOnce({ items: [{ id: "u2", publicName: "one", reason: null }], nextCursor: "c1" })
      .mockResolvedValueOnce({ items: [{ id: "u3", publicName: "two", reason: null }], nextCursor: null });
    renderPage();
    await screen.findByText("one");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("two");
    expect(screen.getByText("one")).not.toBeNull();
    expect(getBlockedUsers).toHaveBeenLastCalledWith(expect.any(String), "me", "c1");
  });

  it("Unblock needs a confirmation; Cancel does nothing, confirming removes the row", async () => {
    vi.mocked(getBlockedUsers).mockResolvedValue({
      items: [{ id: "u2", publicName: "tobi_9", reason: null }],
      nextCursor: null,
    });
    vi.mocked(unblockUser).mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Unblock tobi_9" }));
    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(screen.getByText(/not restored/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(unblockUser).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Unblock tobi_9" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Unblock" }));
    await waitFor(() => expect(unblockUser).toHaveBeenCalledWith(expect.any(String), "u2"));
    await screen.findByText("No blocked users");
  });
});
