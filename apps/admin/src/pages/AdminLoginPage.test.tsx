import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AdminLoginPage from "./AdminLoginPage";
import { AdminAuthError } from "../api/adminAuth";

vi.mock("../auth/AdminAuthContext", () => ({ useAdminAuth: vi.fn() }));
import { useAdminAuth } from "../auth/AdminAuthContext";

const login = vi.fn();
const logout = vi.fn();

function mockAuth(status: "loading" | "authenticated" | "unauthenticated") {
  (useAdminAuth as unknown as Mock).mockReturnValue({ status, admin: null, login, logout });
}

function renderLogin(initial = "/login") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/login" element={<AdminLoginPage />} />
        <Route path="/dashboard" element={<div>DASHBOARD</div>} />
        <Route path="/moderation" element={<div>MODERATION</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AdminLoginPage", () => {
  beforeEach(() => {
    login.mockReset();
    mockAuth("unauthenticated");
  });
  afterEach(cleanup);

  it("renders the sign-in form", () => {
    renderLogin();
    // getByRole/getByLabelText throw if missing — reaching here is the assertion
    screen.getByRole("heading", { name: "Admin Console" });
    screen.getByLabelText("Email");
    screen.getByLabelText("Password");
  });

  it("submits credentials and navigates to /dashboard on success", async () => {
    login.mockResolvedValue(undefined);
    renderLogin();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@soccernity.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "hunter2hunter2" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(screen.queryByText("DASHBOARD")).not.toBeNull());
    expect(login).toHaveBeenCalledWith("ada@soccernity.com", "hunter2hunter2");
  });

  it("shows a non-enumerating error on 401 and stays on the page", async () => {
    login.mockRejectedValue(new AdminAuthError(401, "Invalid email or password."));
    renderLogin();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "x@y.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrongpass1" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Invalid email or password"),
    );
    expect(screen.queryByText("DASHBOARD")).toBeNull();
  });

  it("redirects an already-authenticated visitor to the remembered destination", async () => {
    mockAuth("authenticated");
    render(
      <MemoryRouter initialEntries={[{ pathname: "/login", state: { from: "/moderation" } }]}>
        <Routes>
          <Route path="/login" element={<AdminLoginPage />} />
          <Route path="/dashboard" element={<div>DASHBOARD</div>} />
          <Route path="/moderation" element={<div>MODERATION</div>} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.queryByText("MODERATION")).not.toBeNull());
  });
});
