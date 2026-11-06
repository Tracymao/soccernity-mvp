// B-057: the Add Role page (Figma 1658:2456) against POST /admin/staff. Every state and every server error.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { AdminApiError } from "../../api/adminClient";

vi.mock("../../api/adminStaff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/adminStaff")>();
  return { ...actual, createStaff: vi.fn() };
});
vi.mock("../../auth/AdminAuthContext", () => ({
  useOptionalAdminAuth: vi.fn(),
  useAdminAuth: vi.fn(),
}));

import { createStaff, type CreatedAdminStaff } from "../../api/adminStaff";
import { useOptionalAdminAuth } from "../../auth/AdminAuthContext";
import AddRolePage, { validateAddRole } from "./AddRolePage";

const create = vi.mocked(createStaff);
const auth = vi.mocked(useOptionalAdminAuth);

function signInAs(role: string | null) {
  auth.mockReturnValue(
    role === null
      ? null
      : ({ status: "authenticated", admin: { id: "me", email: "me@soccernity.com", fullName: "Me", role } } as never),
  );
}

function created(over: Partial<CreatedAdminStaff> = {}): CreatedAdminStaff {
  return {
    id: "new-1",
    email: "new.admin@soccernity.com",
    fullName: "New Admin",
    role: "moderator",
    accountStatus: "active",
    createdAt: "2026-11-06T10:00:00.000Z",
    childSafetyVetted: false,
    vettedAt: null,
    vettedByAdminId: null,
    twoFactorEnabled: false,
    ...over,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/settings/roles/new"]}>
      <Routes>
        <Route path="/settings/roles/new" element={<AddRolePage />} />
        <Route path="/settings" element={<div>roles list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const email = () => screen.getByLabelText("Email") as HTMLInputElement;
const nameField = () => screen.getByLabelText("Name") as HTMLInputElement;
const roleField = () => screen.getByLabelText("Role") as HTMLSelectElement;
const password = () => screen.getByLabelText("Create Password") as HTMLInputElement;
const confirmField = () => screen.getByLabelText("Confirm Password") as HTMLInputElement;
const submit = () => screen.getByRole("button", { name: /Submit|Saving/ }) as HTMLButtonElement;

function fill(values: { email?: string; name?: string; role?: string; password?: string; confirm?: string }) {
  if (values.email !== undefined) fireEvent.change(email(), { target: { value: values.email } });
  if (values.name !== undefined) fireEvent.change(nameField(), { target: { value: values.name } });
  if (values.role !== undefined) fireEvent.change(roleField(), { target: { value: values.role } });
  if (values.password !== undefined) fireEvent.change(password(), { target: { value: values.password } });
  if (values.confirm !== undefined) fireEvent.change(confirmField(), { target: { value: values.confirm } });
}

function fillValid() {
  fill({ email: "new.admin@soccernity.com", name: "New Admin", role: "moderator" });
}

beforeEach(() => {
  create.mockReset();
  signInAs("superadmin");
});
afterEach(cleanup);

describe("validateAddRole (mirrors CreateAdminStaffDto)", () => {
  const ok = { email: "a@b.co", name: "A", role: "editor", password: "", confirm: "" };

  it("accepts a valid form with no password (the server generates one)", () => {
    expect(validateAddRole(ok)).toEqual({});
  });

  it("requires email, name and role", () => {
    const errs = validateAddRole({ email: "  ", name: " ", role: "", password: "", confirm: "" });
    expect(errs.email).toBe("Enter an email address.");
    expect(errs.name).toBe("Enter a name.");
    expect(errs.role).toBe("Choose a role.");
  });

  it("rejects a malformed email and one over 254 characters", () => {
    expect(validateAddRole({ ...ok, email: "not-an-email" }).email).toBe("Enter a valid email address.");
    expect(validateAddRole({ ...ok, email: `${"a".repeat(250)}@b.co` }).email).toBe("Enter a valid email address.");
  });

  it("allows a name of 120 characters and rejects 121", () => {
    expect(validateAddRole({ ...ok, name: "n".repeat(120) }).name).toBeUndefined();
    expect(validateAddRole({ ...ok, name: "n".repeat(121) }).name).toBe("Use 120 characters or fewer.");
  });

  it("allows a role only from the server's three", () => {
    for (const r of ["editor", "moderator", "superadmin"]) expect(validateAddRole({ ...ok, role: r }).role).toBeUndefined();
    expect(validateAddRole({ ...ok, role: "owner" }).role).toBe("Choose a role.");
  });

  it("password: 8 to 128 characters, and the confirmation must match", () => {
    expect(validateAddRole({ ...ok, password: "1234567", confirm: "1234567" }).password).toBe("Use at least 8 characters.");
    expect(validateAddRole({ ...ok, password: "12345678", confirm: "12345678" })).toEqual({});
    const long = "p".repeat(128);
    expect(validateAddRole({ ...ok, password: long, confirm: long })).toEqual({});
    const tooLong = "p".repeat(129);
    expect(validateAddRole({ ...ok, password: tooLong, confirm: tooLong }).password).toBe("Use 128 characters or fewer.");
    expect(validateAddRole({ ...ok, password: "12345678", confirm: "12345679" }).confirm).toBe("The passwords don't match.");
    expect(validateAddRole({ ...ok, password: "12345678", confirm: "" }).confirm).toBe("Confirm the password.");
  });

  it("a confirmation typed with no password is still an error", () => {
    expect(validateAddRole({ ...ok, password: "", confirm: "12345678" }).password).toBe("Use at least 8 characters.");
  });
});

describe("AddRolePage — the form (Figma 1658:2456)", () => {
  it("draws the frame's fields in order, with the three roles and a Submit button", () => {
    renderPage();
    expect(screen.getByText("Add a New Role")).toBeTruthy();
    const labels = ["Email", "Name", "Role", "Create Password", "Confirm Password"];
    // each field comes after the previous one in the document
    for (let i = 1; i < labels.length; i += 1) {
      const prev = screen.getByLabelText(labels[i - 1]);
      const cur = screen.getByLabelText(labels[i]);
      expect(prev.compareDocumentPosition(cur) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(Array.from(roleField().options).map((o) => o.textContent)).toEqual([
      "Choose a role",
      "Editor",
      "Moderator",
      "Super Admin",
    ]);
    expect(submit().disabled).toBe(false);
    expect(screen.getByRole("link", { name: "← Roles" }).getAttribute("href")).toBe("/settings");
  });

  it("says the password is optional and generated once", () => {
    renderPage();
    expect(screen.getByText(/Leave this empty and the system generates a password and shows it once/)).toBeTruthy();
  });

  it("shows every empty-field error at once, focuses the first, and sends nothing", () => {
    renderPage();
    fireEvent.click(submit());
    expect(screen.getByText("Enter an email address.")).toBeTruthy();
    expect(screen.getByText("Enter a name.")).toBeTruthy();
    expect(screen.getByText("Choose a role.")).toBeTruthy();
    expect(document.activeElement).toBe(email());
    expect(email().getAttribute("aria-invalid")).toBe("true");
    expect(create).not.toHaveBeenCalled();
  });

  it("clears a field's error as soon as it is edited", () => {
    renderPage();
    fireEvent.click(submit());
    fill({ email: "x@y.co" });
    expect(screen.queryByText("Enter an email address.")).toBeNull();
    expect(screen.getByText("Enter a name.")).toBeTruthy();
  });

  it("a password mismatch is a field error on Confirm Password and sends nothing", () => {
    renderPage();
    fillValid();
    fill({ password: "12345678", confirm: "87654321" });
    fireEvent.click(submit());
    expect(screen.getByText("The passwords don't match.")).toBeTruthy();
    expect(document.activeElement).toBe(confirmField());
    expect(create).not.toHaveBeenCalled();
  });

  it("a short password is a field error on Create Password", () => {
    renderPage();
    fillValid();
    fill({ password: "short", confirm: "short" });
    fireEvent.click(submit());
    expect(screen.getByText("Use at least 8 characters.")).toBeTruthy();
    expect(document.activeElement).toBe(password());
    expect(create).not.toHaveBeenCalled();
  });
});

describe("AddRolePage — who may grant roles", () => {
  it.each(["editor", "moderator"])("a %s sees the not-allowed card and no form", (role) => {
    signInAs(role);
    renderPage();
    expect(screen.getByText("You aren't allowed to add accounts. Only a Super Admin can.")).toBeTruthy();
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
  });

  it("a superadmin gets the form with all three roles", () => {
    signInAs("superadmin");
    renderPage();
    expect(roleField().options.length).toBe(4);
  });

  it("with no known role the form still shows (the server is the gate)", () => {
    signInAs(null);
    renderPage();
    expect(screen.getByLabelText("Email")).toBeTruthy();
  });
});

describe("AddRolePage — submitting", () => {
  it("sends the trimmed values and, with no password typed, no temporaryPassword", async () => {
    create.mockResolvedValue(created({ temporaryPassword: "gen-pass-123" }));
    renderPage();
    fill({ email: "  new.admin@soccernity.com ", name: "  New Admin ", role: "moderator" });
    fireEvent.click(submit());
    await screen.findByText("Account created");
    expect(create).toHaveBeenCalledWith({
      email: "new.admin@soccernity.com",
      fullName: "New Admin",
      role: "moderator",
    });
  });

  it("sends the temporary password when one is set", async () => {
    create.mockResolvedValue(created());
    renderPage();
    fillValid();
    fill({ password: "set-by-admin-1", confirm: "set-by-admin-1" });
    fireEvent.click(submit());
    await screen.findByText("Account created");
    expect(create).toHaveBeenCalledWith({
      email: "new.admin@soccernity.com",
      fullName: "New Admin",
      role: "moderator",
      temporaryPassword: "set-by-admin-1",
    });
  });

  it("is disabled while saving, shows 'Saving…', and ignores a second submit", async () => {
    let release!: (v: CreatedAdminStaff) => void;
    create.mockReturnValue(new Promise<CreatedAdminStaff>((res) => (release = res)));
    renderPage();
    fillValid();
    fireEvent.click(submit());
    await waitFor(() => expect(submit().textContent).toBe("Saving…"));
    expect(submit().disabled).toBe(true);
    expect(email().disabled).toBe(true);
    expect(roleField().disabled).toBe(true);
    fireEvent.submit(email().closest("form") as HTMLFormElement);
    expect(create).toHaveBeenCalledTimes(1);
    release(created());
    await screen.findByText("Account created");
  });
});

describe("AddRolePage — success", () => {
  it("a generated password is shown once, with a Copy button and the no-email note", async () => {
    create.mockResolvedValue(created({ temporaryPassword: "gen-pass-123" }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderPage();
    fillValid();
    fireEvent.click(submit());
    await screen.findByText("Account created");
    expect(screen.getByText("New Admin can now sign in as Moderator.")).toBeTruthy();
    expect(screen.getByText("new.admin@soccernity.com")).toBeTruthy();
    expect(screen.getByTestId("generated-password").textContent).toBe("gen-pass-123");
    expect(screen.getByText(/shown/).textContent).toMatch(/only once.*no email/);
    fireEvent.click(screen.getByRole("button", { name: "Copy password" }));
    await screen.findByText("Copied.");
    expect(writeText).toHaveBeenCalledWith("gen-pass-123");
  });

  it("says so when the password could not be copied", async () => {
    create.mockResolvedValue(created({ temporaryPassword: "gen-pass-123" }));
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("no")) } });
    renderPage();
    fillValid();
    fireEvent.click(submit());
    await screen.findByText("Account created");
    fireEvent.click(screen.getByRole("button", { name: "Copy password" }));
    await screen.findByText(/Couldn't copy/);
  });

  it("with a password the admin set, no password is shown and the note says so", async () => {
    create.mockResolvedValue(created());
    renderPage();
    fillValid();
    fill({ password: "set-by-admin-1", confirm: "set-by-admin-1" });
    fireEvent.click(submit());
    await screen.findByText("Account created");
    expect(screen.queryByTestId("generated-password")).toBeNull();
    expect(screen.queryByText("set-by-admin-1")).toBeNull();
    expect(screen.getByText(/They sign in with the password you set. No email was sent/)).toBeTruthy();
  });

  it("'Add another' returns to an empty form with no password left behind", async () => {
    create.mockResolvedValue(created({ temporaryPassword: "gen-pass-123" }));
    renderPage();
    fillValid();
    fireEvent.click(submit());
    await screen.findByText("Account created");
    fireEvent.click(screen.getByRole("button", { name: "Add another" }));
    expect(email().value).toBe("");
    expect(nameField().value).toBe("");
    expect(roleField().value).toBe("");
    expect(password().value).toBe("");
    expect(screen.queryByText("gen-pass-123")).toBeNull();
  });

  it("'Back to Roles' goes to the list", async () => {
    create.mockResolvedValue(created());
    renderPage();
    fillValid();
    fireEvent.click(submit());
    await screen.findByText("Account created");
    fireEvent.click(screen.getByRole("link", { name: "Back to Roles" }));
    expect(await screen.findByText("roles list")).toBeTruthy();
  });

  it("never writes the password to storage", async () => {
    create.mockResolvedValue(created({ temporaryPassword: "gen-pass-123" }));
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    renderPage();
    fillValid();
    fill({ password: "set-by-admin-1", confirm: "set-by-admin-1" });
    fireEvent.click(submit());
    await screen.findByText("Account created");
    expect(setItem).not.toHaveBeenCalled();
    expect(document.cookie).toBe("");
    setItem.mockRestore();
  });
});

describe("AddRolePage — server errors", () => {
  it("409: email already used, on the Email field, form kept, focus on Email", async () => {
    create.mockRejectedValue(new AdminApiError(409, "An admin account with this email already exists."));
    renderPage();
    fillValid();
    fill({ password: "set-by-admin-1", confirm: "set-by-admin-1" });
    fireEvent.click(submit());
    await screen.findByText("An admin account with this email already exists.");
    expect(email().value).toBe("new.admin@soccernity.com");
    expect(nameField().value).toBe("New Admin");
    expect(password().value).toBe("set-by-admin-1");
    expect(document.activeElement).toBe(email());
    expect(submit().disabled).toBe(false);
  });

  it("403: not allowed, plain message, form kept", async () => {
    create.mockRejectedValue(new AdminApiError(403, "You do not have permission to access this resource"));
    renderPage();
    fillValid();
    fireEvent.click(submit());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("You aren't allowed to add accounts. Only a Super Admin can.");
    expect(email().value).toBe("new.admin@soccernity.com");
  });

  it("400: a fixed plain message, never the server's validation text", async () => {
    create.mockRejectedValue(new AdminApiError(400, "role must be one of the following values: editor, moderator"));
    renderPage();
    fillValid();
    fireEvent.click(submit());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Some of these details weren't accepted. Check them and try again.");
    expect(screen.queryByText(/must be one of/)).toBeNull();
  });

  it("500 and a network failure: a generic retry line, form kept, can submit again", async () => {
    create.mockRejectedValueOnce(new AdminApiError(500, "boom"));
    renderPage();
    fillValid();
    fireEvent.click(submit());
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't create the account. Check the connection and try again.");
    create.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fireEvent.click(submit());
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't create the account. Check the connection and try again.");
    create.mockResolvedValueOnce(created());
    fireEvent.click(submit());
    await screen.findByText("Account created");
  });

  it("the error line clears when a field is edited", async () => {
    create.mockRejectedValue(new AdminApiError(500, "boom"));
    renderPage();
    fillValid();
    fireEvent.click(submit());
    await screen.findByRole("alert");
    fill({ name: "Someone Else" });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
