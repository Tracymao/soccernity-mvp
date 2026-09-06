import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SettingsRolesPage from "./SettingsRolesPage";
import { AddRolePage, EditRolePage, DeleteRolePage } from "./RoleFormPages";

afterEach(cleanup);

describe("Settings / Roles stub screens", () => {
  it("Roles list: discloses DL #191, sample table, Add Role link", () => {
    render(<MemoryRouter><SettingsRolesPage /></MemoryRouter>);
    expect(screen.getByRole("note").textContent).toMatch(/Decision Log #191/);
    expect(screen.getByText("Sample — not real data")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Add Role" }).getAttribute("href")).toBe(
      "/settings/roles/new",
    );
  });

  it("Add Role: full account form + Submit, all disabled", () => {
    render(<MemoryRouter><AddRolePage /></MemoryRouter>);
    for (const el of [...screen.queryAllByRole("textbox"), ...screen.queryAllByRole("combobox")]) {
      expect(el.hasAttribute("disabled")).toBe(true);
    }
    expect(screen.getByRole("button", { name: "Submit" }).hasAttribute("disabled")).toBe(true);
  });

  it("Edit / Delete: reproduced, actions disabled, Delete is navy (not red)", () => {
    render(<MemoryRouter><EditRolePage /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Submit" }).hasAttribute("disabled")).toBe(true);
    cleanup();
    render(<MemoryRouter><DeleteRolePage /></MemoryRouter>);
    const del = screen.getByRole("button", { name: "Delete Role" });
    expect(del.hasAttribute("disabled")).toBe(true);
    expect(del.className).toContain("admin-stub__btn--primary"); // navy, not a red variant
  });
});
