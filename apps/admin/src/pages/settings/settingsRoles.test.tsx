import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AdminApiError } from "../../api/adminClient";

vi.mock("../../api/adminStaff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/adminStaff")>();
  return {
    ...actual,
    listStaff: vi.fn(),
    updateAdminRole: vi.fn(),
    findStaffById: vi.fn(),
  };
});

vi.mock("../../api/adminStaffVetting", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/adminStaffVetting")>();
  return {
    ...actual,
    setChildSafetyVetting: vi.fn(),
  };
});

import {
  listStaff,
  updateAdminRole,
  findStaffById,
  type AdminStaffListItem,
} from "../../api/adminStaff";
import { setChildSafetyVetting } from "../../api/adminStaffVetting";
import SettingsRolesPage from "./SettingsRolesPage";
import { AddRolePage, EditRolePage, DeleteRolePage } from "./RoleFormPages";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(listStaff).mockReset();
  vi.mocked(updateAdminRole).mockReset();
  vi.mocked(findStaffById).mockReset();
  vi.mocked(setChildSafetyVetting).mockReset();
});

function Probe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function renderAt(
  ui: ReactNode,
  routePath: string,
  initialEntry: string | { pathname: string; state?: unknown },
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path={routePath} element={ui} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function admin(overrides: Partial<AdminStaffListItem> = {}): AdminStaffListItem {
  return {
    id: "admin-1",
    email: "mod@example.com",
    fullName: "A Moderator",
    role: "moderator",
    accountStatus: "active",
    createdAt: "2026-09-01T10:00:00.000Z",
    childSafetyVetted: false,
    vettedAt: null,
    vettedByAdminId: null,
    ...overrides,
  };
}

// ---- SettingsRolesPage ---------------------------------------------------

describe("SettingsRolesPage", () => {
  it("loads real staff accounts and renders name/role", async () => {
    vi.mocked(listStaff).mockResolvedValue({ items: [admin()], nextCursor: null });

    render(
      <MemoryRouter>
        <SettingsRolesPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(listStaff).toHaveBeenCalledWith({ limit: 50 }));
    expect(await screen.findByText("A Moderator")).not.toBeNull();
    expect(screen.getByText("moderator")).not.toBeNull();
  });

  it("shows an empty state with no staff accounts", async () => {
    vi.mocked(listStaff).mockResolvedValue({ items: [], nextCursor: null });

    render(
      <MemoryRouter>
        <SettingsRolesPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("No staff accounts")).not.toBeNull();
  });

  it("surfaces a real backend error with a retry", async () => {
    vi.mocked(listStaff).mockRejectedValueOnce(new AdminApiError(403, "You do not have permission to access this resource"));
    vi.mocked(listStaff).mockResolvedValueOnce({ items: [admin()], nextCursor: null });

    render(
      <MemoryRouter>
        <SettingsRolesPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("You do not have permission to access this resource")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("A Moderator")).not.toBeNull();
  });

  it('the "Add Role" button is disabled (Decision Log #191 — no account-creation endpoint)', async () => {
    vi.mocked(listStaff).mockResolvedValue({ items: [], nextCursor: null });

    render(
      <MemoryRouter>
        <SettingsRolesPage />
      </MemoryRouter>,
    );

    const addRole = await screen.findByRole("button", { name: "Add Role" });
    expect(addRole.hasAttribute("disabled")).toBe(true);
  });

  it("each row's Edit link points at the real edit route, carrying the admin via router state", async () => {
    const a = admin();
    vi.mocked(listStaff).mockResolvedValue({ items: [a], nextCursor: null });

    render(
      <MemoryRouter>
        <SettingsRolesPage />
      </MemoryRouter>,
    );

    const editLink = await screen.findByRole("link", { name: "Edit" });
    expect(editLink.getAttribute("href")).toBe(`/settings/roles/edit/${a.id}`);
  });

  it("each row's Delete link still points at the disclosed stub (no delete endpoint)", async () => {
    vi.mocked(listStaff).mockResolvedValue({ items: [admin()], nextCursor: null });

    render(
      <MemoryRouter>
        <SettingsRolesPage />
      </MemoryRouter>,
    );

    const deleteLink = await screen.findByRole("link", { name: "Delete" });
    expect(deleteLink.getAttribute("href")).toBe("/settings/roles/delete");
  });

  it("loads more staff accounts via cursor pagination", async () => {
    vi.mocked(listStaff).mockResolvedValueOnce({ items: [admin()], nextCursor: "cursor-1" });
    vi.mocked(listStaff).mockResolvedValueOnce({
      items: [admin({ id: "admin-2", fullName: "Second Admin" })],
      nextCursor: null,
    });

    render(
      <MemoryRouter>
        <SettingsRolesPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));

    await waitFor(() => expect(listStaff).toHaveBeenLastCalledWith({ cursor: "cursor-1", limit: 50 }));
    expect(await screen.findByText("Second Admin")).not.toBeNull();
  });
});

// ---- AddRolePage / DeleteRolePage (stay disclosed stubs) -----------------

describe("Add / Delete Role — disclosed stubs, Decision Log #191", () => {
  it("Add Role: full account form + Submit, all disabled", () => {
    render(
      <MemoryRouter>
        <AddRolePage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("note").textContent).toMatch(/Decision Log #191/);
    for (const el of [...screen.queryAllByRole("textbox"), ...screen.queryAllByRole("combobox")]) {
      expect(el.hasAttribute("disabled")).toBe(true);
    }
    expect(screen.getByRole("button", { name: "Submit" }).hasAttribute("disabled")).toBe(true);
  });

  it("Delete Role: reproduced, disabled, navy (not red)", () => {
    render(
      <MemoryRouter>
        <DeleteRolePage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("note").textContent).toMatch(/Decision Log #191/);
    const del = screen.getByRole("button", { name: "Delete Role" });
    expect(del.hasAttribute("disabled")).toBe(true);
    expect(del.className).toContain("admin-stub__btn--primary"); // navy, not a red variant
  });
});

// ---- EditRolePage ---------------------------------------------------------

describe("EditRolePage", () => {
  it("renders the admin passed via router state — name, email, role select, not-vetted", async () => {
    const a = admin();
    renderAt(<EditRolePage />, "/settings/roles/edit/:id", {
      pathname: `/settings/roles/edit/${a.id}`,
      state: { admin: a },
    });

    expect(await screen.findByText("A Moderator")).not.toBeNull();
    expect(screen.getByText("mod@example.com")).not.toBeNull();
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("moderator");
    expect(screen.getByText("Not vetted")).not.toBeNull();
    expect(findStaffById).not.toHaveBeenCalled();
  });

  it("saves a new role and shows a success confirmation without navigating away", async () => {
    const a = admin();
    vi.mocked(updateAdminRole).mockResolvedValueOnce(admin({ role: "superadmin" }));

    renderAt(<EditRolePage />, "/settings/roles/edit/:id", {
      pathname: `/settings/roles/edit/${a.id}`,
      state: { admin: a },
    });

    fireEvent.change(await screen.findByRole("combobox"), { target: { value: "superadmin" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(updateAdminRole).toHaveBeenCalledWith(a.id, "superadmin"));
    expect(await screen.findByText("Role updated.")).not.toBeNull();
  });

  it("surfaces the real 409 for a last-active-superadmin demotion", async () => {
    const a = admin({ role: "superadmin" });
    vi.mocked(updateAdminRole).mockRejectedValueOnce(
      new AdminApiError(409, "Cannot change this role: it belongs to the last active superadmin account."),
    );

    renderAt(<EditRolePage />, "/settings/roles/edit/:id", {
      pathname: `/settings/roles/edit/${a.id}`,
      state: { admin: a },
    });

    fireEvent.change(await screen.findByRole("combobox"), { target: { value: "editor" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(
      await screen.findByText("Cannot change this role: it belongs to the last active superadmin account."),
    ).not.toBeNull();
  });

  it("discloses plainly that the vetting toggle performs no verification of its own", async () => {
    const a = admin();
    renderAt(<EditRolePage />, "/settings/roles/edit/:id", {
      pathname: `/settings/roles/edit/${a.id}`,
      state: { admin: a },
    });

    expect(
      await screen.findByText(/toggling it performs no verification of its own/i),
    ).not.toBeNull();
  });

  it('a not-vetted admin shows "Mark as vetted"; clicking it sets childSafetyVetted true', async () => {
    const a = admin({ childSafetyVetted: false });
    vi.mocked(setChildSafetyVetting).mockResolvedValueOnce({
      id: a.id,
      email: a.email,
      fullName: a.fullName,
      role: a.role,
      childSafetyVetted: true,
      vettedAt: "2026-09-27T00:00:00.000Z",
      vettedByAdminId: "superadmin-1",
    });

    renderAt(<EditRolePage />, "/settings/roles/edit/:id", {
      pathname: `/settings/roles/edit/${a.id}`,
      state: { admin: a },
    });

    fireEvent.click(await screen.findByRole("button", { name: "Mark as vetted" }));

    await waitFor(() => expect(setChildSafetyVetting).toHaveBeenCalledWith(a.id, true));
    expect(await screen.findByText("Vetted")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Clear vetting record" })).not.toBeNull();
    expect(screen.getByText(/by admin superadmin-1/)).not.toBeNull();
  });

  it('a vetted admin shows "Clear vetting record"; clicking it sets childSafetyVetted false', async () => {
    const a = admin({ childSafetyVetted: true, vettedAt: "2026-09-20T00:00:00.000Z", vettedByAdminId: "superadmin-1" });
    vi.mocked(setChildSafetyVetting).mockResolvedValueOnce({
      id: a.id,
      email: a.email,
      fullName: a.fullName,
      role: a.role,
      childSafetyVetted: false,
      vettedAt: null,
      vettedByAdminId: null,
    });

    renderAt(<EditRolePage />, "/settings/roles/edit/:id", {
      pathname: `/settings/roles/edit/${a.id}`,
      state: { admin: a },
    });

    fireEvent.click(await screen.findByRole("button", { name: "Clear vetting record" }));

    await waitFor(() => expect(setChildSafetyVetting).toHaveBeenCalledWith(a.id, false));
    expect(await screen.findByText("Not vetted")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Mark as vetted" })).not.toBeNull();
  });

  it("surfaces a real backend error on the vetting toggle without changing the displayed state", async () => {
    const a = admin({ childSafetyVetted: false });
    vi.mocked(setChildSafetyVetting).mockRejectedValueOnce(
      new AdminApiError(403, "You do not have permission to access this resource"),
    );

    renderAt(<EditRolePage />, "/settings/roles/edit/:id", {
      pathname: `/settings/roles/edit/${a.id}`,
      state: { admin: a },
    });

    fireEvent.click(await screen.findByRole("button", { name: "Mark as vetted" }));

    expect(await screen.findByText("You do not have permission to access this resource")).not.toBeNull();
    expect(screen.getByText("Not vetted")).not.toBeNull();
  });

  it("falls back to findStaffById when there is no router state (direct visit / refresh)", async () => {
    const a = admin({ id: "direct-visit-admin" });
    vi.mocked(findStaffById).mockResolvedValueOnce(a);

    renderAt(<EditRolePage />, "/settings/roles/edit/:id", `/settings/roles/edit/${a.id}`);

    await waitFor(() => expect(findStaffById).toHaveBeenCalledWith(a.id));
    expect(await screen.findByText("A Moderator")).not.toBeNull();
  });

  it("shows an honest not-found state when the fallback fetch can't find the admin", async () => {
    vi.mocked(findStaffById).mockResolvedValueOnce(null);

    renderAt(<EditRolePage />, "/settings/roles/edit/:id", "/settings/roles/edit/missing-id");

    expect(await screen.findByText("Admin account not found")).not.toBeNull();
  });
});
