import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import UsersPage from "./UsersPage";

afterEach(cleanup);

describe("UsersPage (stub)", () => {
  it("discloses the missing endpoint, shows the sample table, disables Add Member", () => {
    render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("note").textContent).toContain("GET /admin/users");
    expect(screen.getByText("Sample — not real data")).not.toBeNull();
    expect(screen.getByText(/not admin\/moderator role management/i)).not.toBeNull();
    expect(screen.getByRole("button", { name: "Add Member" }).hasAttribute("disabled")).toBe(true);
  });
});
