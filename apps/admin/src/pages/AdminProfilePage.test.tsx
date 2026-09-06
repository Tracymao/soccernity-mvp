import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminProfilePage from "./AdminProfilePage";
import { AdminApiError } from "../api/adminClient";

vi.mock("../api/adminAuth", () => ({
  updateAdminProfile: vi.fn(),
  changeAdminPassword: vi.fn(),
}));
import { updateAdminProfile, changeAdminPassword } from "../api/adminAuth";

vi.mock("../auth/AdminAuthContext", () => ({ useAdminAuth: vi.fn() }));
import { useAdminAuth } from "../auth/AdminAuthContext";

const applyProfile = vi.fn();
const ADMIN = {
  id: "admin-1",
  email: "kuponiyi.abraham@soccernity.com",
  fullName: "Kuponiyi Abraham",
  phone: "+234 800 000 0000",
  role: "superadmin",
  accountStatus: "active",
  createdAt: "",
  updatedAt: "",
};

beforeEach(() => {
  vi.mocked(updateAdminProfile).mockReset();
  vi.mocked(changeAdminPassword).mockReset();
  applyProfile.mockReset();
  (useAdminAuth as unknown as Mock).mockReturnValue({
    status: "authenticated",
    admin: ADMIN,
    login: vi.fn(),
    logout: vi.fn(),
    applyProfile,
  });
});
afterEach(cleanup);

describe("AdminProfilePage — view", () => {
  it("shows the four fields read-only with a title-cased role", () => {
    render(<AdminProfilePage />);
    expect(screen.getAllByText("Kuponiyi Abraham").length).toBeGreaterThan(0);
    expect(screen.getByText("kuponiyi.abraham@soccernity.com")).not.toBeNull();
    expect(screen.getAllByText("Super Admin").length).toBeGreaterThan(0);
    expect(screen.getByText("+234 800 000 0000")).not.toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

describe("AdminProfilePage — edit", () => {
  it("edits fullName + phone only; email and role are locked, not inputs", () => {
    render(<AdminProfilePage />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Profile" }));
    // exactly two text inputs: Full name + Phone
    const inputs = screen.getAllByRole("textbox");
    expect(inputs.length).toBe(2);
    expect(screen.getByText(/changed by a superadmin, not here/i)).not.toBeNull();
  });

  it("PATCHes the profile and adopts the result", async () => {
    const updated = { ...ADMIN, fullName: "Kuponiyi A. Abraham" };
    vi.mocked(updateAdminProfile).mockResolvedValue(updated);
    render(<AdminProfilePage />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Profile" }));
    const [nameInput] = screen.getAllByRole("textbox");
    fireEvent.change(nameInput, { target: { value: "Kuponiyi A. Abraham" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateAdminProfile).toHaveBeenCalledWith({
        fullName: "Kuponiyi A. Abraham",
        phone: "+234 800 000 0000",
      }),
    );
    expect(applyProfile).toHaveBeenCalledWith(updated);
  });
});

describe("AdminProfilePage — change password", () => {
  function openPanel() {
    render(<AdminProfilePage />);
    fireEvent.click(screen.getByRole("button", { name: "Change Password" }));
  }
  const fill = (label: RegExp, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });

  it("rejects a mismatch client-side without calling the API", () => {
    openPanel();
    fill(/current password/i, "oldpass12");
    fill(/^new password/i, "newpass123");
    fill(/confirm new password/i, "different99");
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(screen.getByRole("alert").textContent).toContain("don’t match");
    expect(changeAdminPassword).not.toHaveBeenCalled();
  });

  it("rejects a short new password client-side", () => {
    openPanel();
    fill(/current password/i, "oldpass12");
    fill(/^new password/i, "short");
    fill(/confirm new password/i, "short");
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(screen.getByRole("alert").textContent).toContain("at least 8");
    expect(changeAdminPassword).not.toHaveBeenCalled();
  });

  it("shows the other-sessions-signed-out message on success", async () => {
    vi.mocked(changeAdminPassword).mockResolvedValue(undefined);
    openPanel();
    fill(/current password/i, "oldpass12");
    fill(/^new password/i, "brandnewpass1");
    fill(/confirm new password/i, "brandnewpass1");
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() =>
      expect(screen.getByText(/signed out of every other Admin Console session/i)).not.toBeNull(),
    );
    expect(changeAdminPassword).toHaveBeenCalledWith("oldpass12", "brandnewpass1");
  });

  it("surfaces a wrong current password (401)", async () => {
    vi.mocked(changeAdminPassword).mockRejectedValue(new AdminApiError(401, "unauthorized"));
    openPanel();
    fill(/current password/i, "wrongpass1");
    fill(/^new password/i, "brandnewpass1");
    fill(/confirm new password/i, "brandnewpass1");
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("current password is incorrect"),
    );
  });
});
