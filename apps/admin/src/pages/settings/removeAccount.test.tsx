// B-058: Remove account on the Roles list (Decision Log #472, a soft remove). Every state of the dialog, the server's 409, the
// own-account rule and the hiding for an admin who is not a super admin.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AdminApiError } from "../../api/adminClient";

vi.mock("../../api/adminStaff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/adminStaff")>();
  return { ...actual, listStaff: vi.fn(), updateAdminStatus: vi.fn() };
});
vi.mock("../../auth/AdminAuthContext", () => ({
  useOptionalAdminAuth: vi.fn(),
  useAdminAuth: vi.fn(),
}));

import { listStaff, updateAdminStatus, type AdminStaffListItem } from "../../api/adminStaff";
import { useOptionalAdminAuth } from "../../auth/AdminAuthContext";
import SettingsRolesPage from "./SettingsRolesPage";

const list = vi.mocked(listStaff);
const status = vi.mocked(updateAdminStatus);
const auth = vi.mocked(useOptionalAdminAuth);

function row(over: Partial<AdminStaffListItem> = {}): AdminStaffListItem {
  return {
    id: "a1",
    email: "amaka@soccernity.com",
    fullName: "Amaka Eze",
    role: "moderator",
    accountStatus: "active",
    createdAt: "2026-11-01T10:00:00.000Z",
    childSafetyVetted: false,
    vettedAt: null,
    vettedByAdminId: null,
    twoFactorEnabled: false,
    ...over,
  };
}

function signInAs(role: string | null, id = "me") {
  auth.mockReturnValue(
    role === null
      ? null
      : ({ status: "authenticated", admin: { id, email: "me@soccernity.com", fullName: "Me", role } } as never),
  );
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsRolesPage />
    </MemoryRouter>,
  );
}

const removeBtn = (name: string) => screen.findByRole("button", { name: `Remove account: ${name}` });

beforeEach(() => {
  list.mockReset();
  status.mockReset();
  auth.mockReset();
  signInAs("superadmin");
  list.mockResolvedValue({
    items: [row({ id: "me", fullName: "Kuponiyi Abraham", role: "superadmin" }), row()],
    nextCursor: null,
  });
});
afterEach(cleanup);

describe("Remove account — confirm", () => {
  it("opens the confirm dialog from the row, with the drawn wording, and Cancel closes it without calling the server", async () => {
    renderPage();
    fireEvent.click(await removeBtn("Amaka Eze"));

    const dialog = screen.getByRole("dialog", { name: "Remove this account?" });
    expect(dialog.textContent).toContain("Amaka Eze’s account and history are kept, but they can no longer sign in.");
    expect(screen.getByRole("button", { name: "Remove account" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(status).not.toHaveBeenCalled();
  });

  it("moves focus to Cancel (not to the destructive button) and gives it back to the row's button on close", async () => {
    renderPage();
    const opener = await removeBtn("Amaka Eze");
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(document.activeElement).toBe(opener);
  });

  it("closes on Escape and on the close control", async () => {
    renderPage();
    fireEvent.click(await removeBtn("Amaka Eze"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(await removeBtn("Amaka Eze"));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(status).not.toHaveBeenCalled();
  });
});

describe("Remove account — removing and done", () => {
  it("shows Removing…, disables the buttons and ignores Escape and a second click while the request is in flight", async () => {
    let resolve!: (v: AdminStaffListItem) => void;
    status.mockReturnValue(new Promise((r) => (resolve = r)));
    renderPage();
    fireEvent.click(await removeBtn("Amaka Eze"));
    fireEvent.click(screen.getByRole("button", { name: "Remove account" }));

    const busy = await screen.findByRole("button", { name: "Removing…" });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Close" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(busy);
    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(status).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenCalledWith("a1", "deactivated");

    await act(async () => resolve(row({ accountStatus: "deactivated" })));
  });

  it("on success closes the dialog, shows the Done banner, marks the row Removed and dims its actions", async () => {
    status.mockResolvedValue(row({ accountStatus: "deactivated" }));
    renderPage();
    fireEvent.click(await removeBtn("Amaka Eze"));
    fireEvent.click(screen.getByRole("button", { name: "Remove account" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const banner = screen.getByRole("status");
    expect(banner.textContent).toContain("Account removed");
    expect(banner.textContent).toContain("Amaka Eze can no longer sign in. Their account and history are kept.");
    expect(screen.getByText("Removed")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Remove account: Amaka Eze" })).toBeNull();
    // Other rows keep their action.
    expect(screen.getByRole("button", { name: "Remove account: Kuponiyi Abraham" })).not.toBeNull();
    const removedRow = screen.getByText("Removed").closest(".rl-table__row");
    expect(removedRow?.className).toContain("rl-table__row--removed");
  });

  it("a row that is already deactivated shows Removed and offers no Remove action", async () => {
    list.mockResolvedValue({ items: [row({ accountStatus: "deactivated" })], nextCursor: null });
    renderPage();
    expect(await screen.findByText("Removed")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Remove account/ })).toBeNull();
  });
});

describe("Remove account — errors", () => {
  it("a failed request shows the could-not-remove state, leaves the row as it was, and Try again can succeed", async () => {
    status.mockRejectedValueOnce(new AdminApiError(500, "boom"));
    status.mockResolvedValueOnce(row({ accountStatus: "deactivated" }));
    renderPage();
    fireEvent.click(await removeBtn("Amaka Eze"));
    fireEvent.click(screen.getByRole("button", { name: "Remove account" }));

    const dialog = await screen.findByRole("dialog", { name: "Couldn’t remove the account" });
    expect(dialog.textContent).toContain("Amaka Eze’s account hasn’t changed. Check the connection and try again.");
    expect(screen.queryByText("Removed")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(status).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Removed")).not.toBeNull();
  });

  it("a network failure (not an API error) is the same could-not-remove state, and Cancel closes it", async () => {
    status.mockRejectedValue(new TypeError("Failed to fetch"));
    renderPage();
    fireEvent.click(await removeBtn("Amaka Eze"));
    fireEvent.click(screen.getByRole("button", { name: "Remove account" }));
    await screen.findByRole("dialog", { name: "Couldn’t remove the account" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Removed")).toBeNull();
  });

  it("a 403 is also the could-not-remove state (the server's own refusal is never shown as text)", async () => {
    status.mockRejectedValue(new AdminApiError(403, "Forbidden resource"));
    renderPage();
    fireEvent.click(await removeBtn("Amaka Eze"));
    fireEvent.click(screen.getByRole("button", { name: "Remove account" }));
    const dialog = await screen.findByRole("dialog", { name: "Couldn’t remove the account" });
    expect(dialog.textContent).not.toContain("Forbidden resource");
  });

  it("a 409 is the last-active-super-admin state; OK closes it and the row is unchanged", async () => {
    status.mockRejectedValue(new AdminApiError(409, "Cannot deactivate the last active superadmin"));
    list.mockResolvedValue({
      items: [row({ id: "other", fullName: "Only Super", role: "superadmin" })],
      nextCursor: null,
    });
    renderPage();
    fireEvent.click(await removeBtn("Only Super"));
    fireEvent.click(screen.getByRole("button", { name: "Remove account" }));

    const dialog = await screen.findByRole("dialog", { name: "This is the last active super admin" });
    expect(dialog.textContent).toContain(
      "At least one active super admin is needed to manage staff. Give another account the Super Admin role first, then remove this one.",
    );
    // Not the server's English.
    expect(dialog.textContent).not.toContain("Cannot deactivate");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Removed")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "Remove account: Only Super" })).not.toBeNull();
  });
});

describe("Remove account — your own account", () => {
  it("shows the own-account dialog and never calls the server", async () => {
    renderPage();
    fireEvent.click(await removeBtn("Kuponiyi Abraham"));

    const dialog = screen.getByRole("dialog", { name: "You can’t remove your own account" });
    expect(dialog.textContent).toContain("Ask another super admin to remove it.");
    expect(screen.queryByRole("button", { name: "Remove account" })).toBeNull();
    expect(status).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(status).not.toHaveBeenCalled();
    expect(screen.queryByText("Removed")).toBeNull();
  });
});

describe("Remove account — who sees it", () => {
  it("is offered to a super admin", async () => {
    signInAs("superadmin");
    renderPage();
    expect(await removeBtn("Amaka Eze")).not.toBeNull();
  });

  it.each(["editor", "moderator"])("is hidden from a %s", async (role) => {
    signInAs(role);
    renderPage();
    await screen.findByText("Amaka Eze");
    expect(screen.queryByRole("button", { name: /Remove account/ })).toBeNull();
  });

  it("is offered when the role is not known yet (no provider) and the server decides", async () => {
    signInAs(null);
    renderPage();
    expect(await removeBtn("Amaka Eze")).not.toBeNull();
  });

  it("leaves the existing Edit and Delete links on each row untouched", async () => {
    renderPage();
    const edits = await screen.findAllByRole("link", { name: "Edit" });
    expect(edits.length).toBe(2);
    expect(screen.getAllByRole("link", { name: "Delete" })[0].getAttribute("href")).toBe("/settings/roles/delete");
  });
});
