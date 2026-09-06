import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AdminShell from "./AdminShell";
import { ADMIN_NAV_ALL } from "./adminNav";

vi.mock("../auth/AdminAuthContext", () => ({ useAdminAuth: vi.fn() }));
import { useAdminAuth } from "../auth/AdminAuthContext";

const logout = vi.fn();

function renderShell(admin: { fullName: string; role: string } | null) {
  (useAdminAuth as unknown as Mock).mockReturnValue({
    status: "authenticated",
    admin: admin
      ? {
          id: "a1",
          email: "a@b.com",
          phone: null,
          accountStatus: "active",
          createdAt: "",
          updatedAt: "",
          ...admin,
        }
      : null,
    login: vi.fn(),
    logout,
  });
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route element={<AdminShell />}>
          <Route path="/dashboard" element={<div>DASH OUTLET</div>} />
        </Route>
        <Route path="/login" element={<div>BACK AT LOGIN</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AdminShell", () => {
  beforeEach(() => logout.mockReset());
  afterEach(cleanup);

  it("renders all 10 nav items and the routed outlet", () => {
    renderShell({ fullName: "Ada Lovelace", role: "moderator" });
    for (const item of ADMIN_NAV_ALL) {
      expect(screen.getByRole("link", { name: new RegExp(item.label) })).not.toBeNull();
    }
    expect(screen.getByText("DASH OUTLET")).not.toBeNull();
  });

  it("shows the signed-in admin's name and title-cased role", () => {
    renderShell({ fullName: "Ada Lovelace", role: "moderator" });
    expect(screen.getByText("Ada Lovelace")).not.toBeNull();
    expect(screen.getByText("Moderator")).not.toBeNull();
  });

  it("falls back to a generic identity when the profile has not hydrated", () => {
    renderShell(null);
    expect(screen.getAllByText("Admin").length).toBeGreaterThan(0);
  });

  it("logs out and returns to /login", async () => {
    logout.mockResolvedValue(undefined);
    renderShell({ fullName: "Ada Lovelace", role: "moderator" });
    fireEvent.click(screen.getByRole("button", { name: "Log Out" }));
    await waitFor(() => expect(screen.queryByText("BACK AT LOGIN")).not.toBeNull());
    expect(logout).toHaveBeenCalledOnce();
  });
});
