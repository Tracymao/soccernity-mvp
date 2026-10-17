// B-125 interim Create Profile (see CreateProfilePage.tsx's header comment).
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import CreateProfilePage from "./CreateProfilePage";
import { UsersApiError } from "../api/users";

vi.mock("../api/users", async () => {
  const actual = await vi.importActual<typeof import("../api/users")>("../api/users");
  return { ...actual, getUser: vi.fn(), updateUser: vi.fn() };
});
import { getUser, updateUser } from "../api/users";

function b64(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fakeToken(sub = "user-1"): string {
  return `${b64({ alg: "none" })}.${b64({ sub, role: "fan" })}.sig`;
}

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(getUser).mockReset();
  vi.mocked(updateUser).mockReset();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/create-profile"]}>
      <Routes>
        <Route path="/create-profile" element={<CreateProfilePage />} />
        <Route path="/signup/clubs" element={<p>club picker page</p>} />
        <Route path="/guardian-consent" element={<p>restricted pending page</p>} />
        <Route path="/verify-email/prompt" element={<p>verify prompt page</p>} />
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CreateProfilePage", () => {
  it("sends a visitor with no session to /login and calls nothing", () => {
    renderPage();
    expect(screen.getByText("login page")).not.toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("saves a username, then goes to the Club Picker", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeToken("user-1"));
    vi.mocked(getUser).mockResolvedValue({ nextStep: "create_profile" } as Awaited<ReturnType<typeof getUser>>);
    vi.mocked(updateUser).mockResolvedValue({} as Awaited<ReturnType<typeof updateUser>>);
    renderPage();

    fireEvent.change(await screen.findByLabelText("Username"), { target: { value: "tobi_9" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith(expect.any(String), "user-1", { username: "tobi_9" }));
    expect(await screen.findByText("club picker page")).not.toBeNull();
  });

  it("rejects a malformed username locally and never calls the API", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeToken());
    vi.mocked(getUser).mockResolvedValue({ nextStep: "create_profile" } as Awaited<ReturnType<typeof getUser>>);
    renderPage();

    fireEvent.change(await screen.findByLabelText("Username"), { target: { value: "no spaces!" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/3-30 characters/i);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("shows the server's own message when the username is refused", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeToken());
    vi.mocked(getUser).mockResolvedValue({ nextStep: "create_profile" } as Awaited<ReturnType<typeof getUser>>);
    vi.mocked(updateUser).mockRejectedValue(new UsersApiError("That username isn't available.", { status: 409 }));
    renderPage();

    fireEvent.change(await screen.findByLabelText("Username"), { target: { value: "taken_name" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect((await screen.findByRole("alert")).textContent).toBe("That username isn't available.");
    expect(screen.queryByText("club picker page")).toBeNull();
  });

  it("sends a restricted-pending account back to /guardian-consent instead of showing the form", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeToken());
    vi.mocked(getUser).mockResolvedValue({ nextStep: "restricted_pending" } as Awaited<ReturnType<typeof getUser>>);
    renderPage();
    expect(await screen.findByText("restricted pending page")).not.toBeNull();
  });

  it("sends an unverified account back to the verify prompt", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeToken());
    vi.mocked(getUser).mockResolvedValue({ nextStep: "verify_email" } as Awaited<ReturnType<typeof getUser>>);
    renderPage();
    expect(await screen.findByText("verify prompt page")).not.toBeNull();
  });

  it("moves an account whose profile is already complete on to the Club Picker", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeToken());
    vi.mocked(getUser).mockResolvedValue({ nextStep: "none" } as Awaited<ReturnType<typeof getUser>>);
    renderPage();
    expect(await screen.findByText("club picker page")).not.toBeNull();
  });
});
