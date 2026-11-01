// Where the two-factor cards sit: on the Admin Profile page, and on the Edit role page (superadmin staff).
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import AdminProfilePage from "../AdminProfilePage";
import { EditRolePage } from "../settings/RoleFormPages";
import * as copy from "./twoFactorCopy";

vi.mock("../../auth/AdminAuthContext", () => ({ useAdminAuth: vi.fn() }));
import { useAdminAuth } from "../../auth/AdminAuthContext";

vi.mock("../../api/adminTwoFactor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/adminTwoFactor")>();
  return { ...actual, getAdminTwoFactorStatus: vi.fn(), resetAdminTwoFactor: vi.fn() };
});
import { getAdminTwoFactorStatus } from "../../api/adminTwoFactor";

beforeEach(() => {
  (useAdminAuth as unknown as Mock).mockReturnValue({
    status: "authenticated",
    admin: { id: "admin-1", email: "ada@soccernity.com", fullName: "Ada Lovelace", phone: null, role: "superadmin", accountStatus: "active", createdAt: "", updatedAt: "" },
    login: vi.fn(),
    logout: vi.fn(),
    applyProfile: vi.fn(),
  });
  vi.mocked(getAdminTwoFactorStatus).mockResolvedValue({ enabled: true, backupCodesRemaining: 7, enforced: true });
});
afterEach(cleanup);

describe("placement", () => {
  it("Admin Profile shows the two-factor card below the profile card, loading the real status", async () => {
    render(<AdminProfilePage />);
    expect(await screen.findByText("7 of 10")).not.toBeNull();
    expect(getAdminTwoFactorStatus).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Edit Profile" })).not.toBeNull();
  });

  it("Edit role shows the Reset two-factor card for the admin being edited, between Account status and vetting", () => {
    const admin = {
      id: "admin-2",
      email: "amara@soccernity.com",
      fullName: "Amara Okafor",
      role: "moderator",
      accountStatus: "active",
      createdAt: "",
      childSafetyVetted: false,
      vettedAt: null,
      vettedByAdminId: null,
    };
    render(
      <MemoryRouter initialEntries={[{ pathname: "/settings/roles/admin-2", state: { admin } }]}>
        <Routes>
          <Route path="/settings/roles/:id" element={<EditRolePage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(copy.RESET_CARD_BODY)).not.toBeNull();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings.indexOf("Account status")).toBeLessThan(headings.indexOf(copy.CARD_TITLE));
    expect(headings.indexOf(copy.CARD_TITLE)).toBeLessThan(headings.indexOf("Child safety vetting"));
    expect((screen.getByRole("button", { name: copy.RESET_BUTTON }) as HTMLButtonElement).disabled).toBe(false);
  });
});
