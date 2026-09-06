import { describe, it, expect, vi, afterEach, type Mock } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import RequireAdminAuth from "./RequireAdminAuth";

vi.mock("./AdminAuthContext", () => ({ useAdminAuth: vi.fn() }));
import { useAdminAuth } from "./AdminAuthContext";

function renderGuard(status: "loading" | "authenticated" | "unauthenticated") {
  (useAdminAuth as unknown as Mock).mockReturnValue({ status, admin: null, login: vi.fn(), logout: vi.fn() });
  return render(
    <MemoryRouter initialEntries={["/secret"]}>
      <Routes>
        <Route element={<RequireAdminAuth />}>
          <Route path="/secret" element={<div>SECRET AREA</div>} />
        </Route>
        <Route path="/login" element={<div>LOGIN PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RequireAdminAuth", () => {
  afterEach(cleanup);

  it("shows a splash while the session is loading", () => {
    renderGuard("loading");
    expect(screen.getByText(/loading the admin console/i)).not.toBeNull();
    expect(screen.queryByText("SECRET AREA")).toBeNull();
  });

  it("redirects to /login when unauthenticated", () => {
    renderGuard("unauthenticated");
    expect(screen.getByText("LOGIN PAGE")).not.toBeNull();
    expect(screen.queryByText("SECRET AREA")).toBeNull();
  });

  it("renders the protected outlet when authenticated", () => {
    renderGuard("authenticated");
    expect(screen.getByText("SECRET AREA")).not.toBeNull();
  });
});
