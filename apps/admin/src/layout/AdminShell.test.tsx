import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
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

  it("renders all 12 nav items for a moderator, and the routed outlet", () => {
    renderShell({ fullName: "Ada Lovelace", role: "moderator" });
    for (const item of ADMIN_NAV_ALL) {
      expect(screen.getByRole("link", { name: new RegExp(item.label) })).not.toBeNull();
    }
    expect(screen.getByText("DASH OUTLET")).not.toBeNull();
  });

  // B-139 part (c): the Username reviews row is limited to the roles the routes behind it allow. A display rule
  // only; the server answers an editor with a 403 on both routes.
  it.each(["moderator", "superadmin"])("shows the Username reviews row to a %s, linking to /username-reviews", (role) => {
    renderShell({ fullName: "Ada Lovelace", role });
    const link = screen.getByRole("link", { name: "Username reviews" });
    expect(link.getAttribute("href")).toBe("/username-reviews");
  });

  it("does not show the Username reviews row to an editor, or before the profile has hydrated", () => {
    renderShell({ fullName: "Ada Lovelace", role: "editor" });
    expect(screen.queryByRole("link", { name: "Username reviews" })).toBeNull();
    // The rest of the nav is unchanged for an editor.
    expect(screen.getByRole("link", { name: "Moderation" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Activity" })).not.toBeNull();
    cleanup();
    renderShell(null);
    expect(screen.queryByRole("link", { name: "Username reviews" })).toBeNull();
  });

  it("puts the Username reviews row directly after Moderation, as the Figma shell does", () => {
    renderShell({ fullName: "Ada Lovelace", role: "moderator" });
    const labels = screen
      .getAllByRole("link")
      .map((link) => link.textContent)
      .filter((text) => text === "Moderation" || text === "Username reviews" || text === "Categories");
    expect(labels).toEqual(["Moderation", "Username reviews", "Categories"]);
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
