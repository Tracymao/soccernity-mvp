import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AdminApiError } from "../../api/adminClient";

vi.mock("../../api/adminUsers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/adminUsers")>();
  return {
    ...actual,
    listUsers: vi.fn(),
    updateUserStatus: vi.fn(),
  };
});

import { listUsers, updateUserStatus, type AdminUserListItem } from "../../api/adminUsers";
import UsersPage from "./UsersPage";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(listUsers).mockReset();
  vi.mocked(updateUserStatus).mockReset();
});

function user(overrides: Partial<AdminUserListItem> = {}): AdminUserListItem {
  return {
    id: "user-1",
    displayName: "Ada Player",
    email: "ada@example.com",
    accountStatus: "active",
    createdAt: "2026-09-14T10:00:00.000Z",
    ...overrides,
  };
}

describe("UsersPage", () => {
  it("loads real users and renders name/date/status", async () => {
    vi.mocked(listUsers).mockResolvedValue({ items: [user()], nextCursor: null });

    render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(listUsers).toHaveBeenCalledWith({ status: undefined, limit: 50 }));
    expect(await screen.findByText("Ada Player")).not.toBeNull();
    expect(screen.getByText("active")).not.toBeNull();
  });

  it("filters by status when a tab is clicked", async () => {
    vi.mocked(listUsers).mockResolvedValue({ items: [], nextCursor: null });

    render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(listUsers).toHaveBeenCalledWith({ status: undefined, limit: 50 }));
    fireEvent.click(screen.getByRole("button", { name: "Suspended" }));

    await waitFor(() => expect(listUsers).toHaveBeenLastCalledWith({ status: "suspended", limit: 50 }));
  });

  it("shows an empty state with no users", async () => {
    vi.mocked(listUsers).mockResolvedValue({ items: [], nextCursor: null });

    render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("No users")).not.toBeNull();
  });

  it("surfaces a real backend error with a retry", async () => {
    vi.mocked(listUsers).mockRejectedValueOnce(new AdminApiError(500, "Server error"));
    vi.mocked(listUsers).mockResolvedValueOnce({ items: [user()], nextCursor: null });

    render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Server error")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Ada Player")).not.toBeNull();
  });

  it('renders "Block" for an active user and "Unblock" for a suspended one', async () => {
    vi.mocked(listUsers).mockResolvedValue({
      items: [
        user({ id: "user-1", displayName: "Ada Player", accountStatus: "active" }),
        user({ id: "user-2", displayName: "Ben Player", accountStatus: "suspended" }),
      ],
      nextCursor: null,
    });

    render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>,
    );

    await screen.findByText("Ada Player");
    expect(screen.getAllByRole("button", { name: "Block" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Unblock" })).toHaveLength(1);
  });

  it("blocks (suspends) a user and reflects the new status without a refetch", async () => {
    vi.mocked(listUsers).mockResolvedValue({ items: [user()], nextCursor: null });
    vi.mocked(updateUserStatus).mockResolvedValue({
      deleted: false,
      user: user({ accountStatus: "suspended" }),
    });

    render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Block" }));

    await waitFor(() => expect(updateUserStatus).toHaveBeenCalledWith("user-1", "suspended"));
    expect(await screen.findByText("suspended")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Unblock" })).not.toBeNull();
    expect(listUsers).toHaveBeenCalledTimes(1);
  });

  it("surfaces a real backend error on block without changing the row's status", async () => {
    vi.mocked(listUsers).mockResolvedValue({ items: [user()], nextCursor: null });
    vi.mocked(updateUserStatus).mockRejectedValue(new AdminApiError(500, "Server error"));

    render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Block" }));

    expect(await screen.findByText("Server error")).not.toBeNull();
    expect(screen.getByText("active")).not.toBeNull();
  });

  it("deletes a user only after an explicit confirm step, then removes the row", async () => {
    vi.mocked(listUsers).mockResolvedValue({ items: [user()], nextCursor: null });
    vi.mocked(updateUserStatus).mockResolvedValue({ deleted: true, id: "user-1" });

    render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    // Not deleted yet — the click above only opens the inline confirm.
    expect(updateUserStatus).not.toHaveBeenCalled();
    expect(screen.getByText("Ada Player")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => expect(updateUserStatus).toHaveBeenCalledWith("user-1", "deleted"));
    await waitFor(() => expect(screen.queryByText("Ada Player")).toBeNull());
  });

  it("cancelling the delete confirm leaves the user in place, never calls the API", async () => {
    vi.mocked(listUsers).mockResolvedValue({ items: [user()], nextCursor: null });

    render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(updateUserStatus).not.toHaveBeenCalled();
    expect(screen.getByText("Ada Player")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Delete" })).not.toBeNull();
  });

  it('the "Add Member" button is disabled (Section 4.8 has no user-creation endpoint)', async () => {
    vi.mocked(listUsers).mockResolvedValue({ items: [], nextCursor: null });

    render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>,
    );

    const addMember = await screen.findByRole("button", { name: "Add Member" });
    expect(addMember.hasAttribute("disabled")).toBe(true);
  });

  it("loads more users via cursor pagination", async () => {
    vi.mocked(listUsers).mockResolvedValueOnce({ items: [user()], nextCursor: "cursor-1" });
    vi.mocked(listUsers).mockResolvedValueOnce({
      items: [user({ id: "user-2", displayName: "Second Player" })],
      nextCursor: null,
    });

    render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));

    await waitFor(() =>
      expect(listUsers).toHaveBeenLastCalledWith({ status: undefined, cursor: "cursor-1", limit: 50 }),
    );
    expect(await screen.findByText("Second Player")).not.toBeNull();
  });
});
