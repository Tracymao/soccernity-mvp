// B-271 follow-ups: the Two-factor column on the staff list (Figma 6909:34859) and the Edit admin page being driven by
// twoFactorEnabled through the router-state handoff and the fallback fetch (Figma 6907:34127, 6908:34249, 6908:34466).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { AdminApiError } from "../../api/adminClient";

vi.mock("../../api/adminStaff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/adminStaff")>();
  return { ...actual, listStaff: vi.fn(), findStaffById: vi.fn(), updateAdminRole: vi.fn(), updateAdminStatus: vi.fn() };
});
vi.mock("../../api/adminTwoFactor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/adminTwoFactor")>();
  return { ...actual, resetAdminTwoFactor: vi.fn() };
});
import { findStaffById, listStaff, type AdminStaffListItem } from "../../api/adminStaff";
import { resetAdminTwoFactor } from "../../api/adminTwoFactor";
import * as copy from "../two-factor/twoFactorCopy";
import SettingsRolesPage from "./SettingsRolesPage";
import { EditRolePage } from "./RoleFormPages";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(listStaff).mockReset();
  vi.mocked(findStaffById).mockReset();
  vi.mocked(resetAdminTwoFactor).mockReset();
});

function staff(overrides: Partial<AdminStaffListItem> = {}): AdminStaffListItem {
  return {
    id: "admin-2",
    email: "amara@soccernity.com",
    fullName: "Amara Okafor",
    role: "moderator",
    accountStatus: "active",
    createdAt: "2026-09-01T10:00:00.000Z",
    childSafetyVetted: false,
    vettedAt: null,
    vettedByAdminId: null,
    twoFactorEnabled: true,
    ...overrides,
  };
}

describe("Roles list: Two-factor column", () => {
  it("shows the word On or Off for each admin (never only a colour), in a TWO-FACTOR column", async () => {
    vi.mocked(listStaff).mockResolvedValue({
      items: [
        staff({ id: "a", fullName: "Ada On", twoFactorEnabled: true }),
        staff({ id: "b", fullName: "Bola Off", twoFactorEnabled: false }),
      ],
      nextCursor: null,
    });
    render(
      <MemoryRouter>
        <SettingsRolesPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Ada On")).not.toBeNull();
    expect(screen.getByText("Two-factor")).not.toBeNull();
    const rows = Array.from(document.querySelectorAll(".rl-table__row:not(.rl-table__row--head)"));
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByText("On")).not.toBeNull();
    expect(within(rows[1] as HTMLElement).getByText("Off")).not.toBeNull();
    // the On / Off pills keep their capital letter (the other pills are lower-cased by CSS)
    expect(within(rows[0] as HTMLElement).getByText("On").className).toContain("rl-pill--keep-case");
  });

  it("the Edit link hands the whole staff item, twoFactorEnabled included, to the Edit page", async () => {
    vi.mocked(listStaff).mockResolvedValue({ items: [staff({ twoFactorEnabled: false })], nextCursor: null });
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<SettingsRolesPage />} />
          <Route path="/settings/roles/edit/:id" element={<EditRolePage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("link", { name: "Edit" }));
    expect(await screen.findByText(copy.RESET_OFF_BODY)).not.toBeNull();
    expect(findStaffById).not.toHaveBeenCalled();
  });
});

describe("Edit admin page", () => {
  function renderEdit(state?: { admin: AdminStaffListItem }) {
    return render(
      <MemoryRouter initialEntries={[{ pathname: "/settings/roles/edit/admin-2", state }]}>
        <Routes>
          <Route path="/settings/roles/edit/:id" element={<EditRolePage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("keeps the card order Account, Account status, Two-factor, Child safety vetting", () => {
    renderEdit({ admin: staff() });
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings.slice(0, 4)).toEqual(["Account", "Account status", copy.CARD_TITLE, "Child safety vetting"]);
  });

  it("two-factor on (from router state): On, the on line, Reset enabled", () => {
    renderEdit({ admin: staff({ twoFactorEnabled: true }) });
    expect(screen.getByText(copy.RESET_ON_BODY)).not.toBeNull();
    expect((screen.getByRole("button", { name: copy.RESET_BUTTON }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("two-factor off (from router state): Off, the reason line, Reset disabled", () => {
    renderEdit({ admin: staff({ twoFactorEnabled: false }) });
    expect(screen.getByText(copy.RESET_OFF_BODY)).not.toBeNull();
    expect(screen.getByText(copy.RESET_UNAVAILABLE)).not.toBeNull();
    expect((screen.getByRole("button", { name: copy.RESET_BUTTON }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a direct visit (no router state) uses the fallback fetch and gets twoFactorEnabled from it", async () => {
    vi.mocked(findStaffById).mockResolvedValue(staff({ twoFactorEnabled: false }));
    renderEdit(undefined);
    expect(await screen.findByText(copy.RESET_OFF_BODY)).not.toBeNull();
    expect((screen.getByRole("button", { name: copy.RESET_BUTTON }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("after a reset the card flips to Off with Reset disabled, and keeps the done banner (6908:34466)", async () => {
    vi.mocked(resetAdminTwoFactor).mockResolvedValue({ id: "admin-2", twoFactorEnabled: false });
    renderEdit({ admin: staff({ twoFactorEnabled: true }) });
    fireEvent.click(screen.getByRole("button", { name: copy.RESET_BUTTON }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: copy.RESET_CONFIRM_BUTTON }));
    expect(await screen.findByText(copy.RESET_DONE_TITLE)).not.toBeNull();
    await waitFor(() => expect(screen.getByText(copy.RESET_OFF_BODY)).not.toBeNull());
    expect((screen.getByRole("button", { name: copy.RESET_BUTTON }) as HTMLButtonElement).disabled).toBe(true);
    expect(resetAdminTwoFactor).toHaveBeenCalledWith("admin-2");
  });

  it("a stale list: Reset is offered, the API says 409 two_factor_not_enabled, and the card then reads Off", async () => {
    vi.mocked(resetAdminTwoFactor).mockRejectedValue(
      new AdminApiError(409, "Two-factor authentication is not turned on.", { code: "two_factor_not_enabled" }),
    );
    renderEdit({ admin: staff({ twoFactorEnabled: true }) });
    fireEvent.click(screen.getByRole("button", { name: copy.RESET_BUTTON }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: copy.RESET_CONFIRM_BUTTON }));
    expect(await screen.findByText(copy.RESET_NOTHING)).not.toBeNull();
    await waitFor(() => expect(screen.getByText(copy.RESET_OFF_BODY)).not.toBeNull());
    expect((screen.getByRole("button", { name: copy.RESET_BUTTON }) as HTMLButtonElement).disabled).toBe(true);
  });
});
