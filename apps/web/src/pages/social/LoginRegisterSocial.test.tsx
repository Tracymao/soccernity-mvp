// B-085: Login and Register carry the social block, and only when the API says a provider is enabled.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("../../api/socialAuth", async () => {
  const actual = await vi.importActual<typeof import("../../api/socialAuth")>("../../api/socialAuth");
  return { ...actual, getEnabledSocialProviders: vi.fn() };
});
vi.mock("../../lib/socialSignIn", () => ({ beginSocialSignIn: vi.fn() }));
import { getEnabledSocialProviders } from "../../api/socialAuth";
import { beginSocialSignIn } from "../../lib/socialSignIn";
import LoginPage from "../LoginPage";
import RegisterStep from "../signup/RegisterStep";

beforeEach(() => {
  vi.mocked(getEnabledSocialProviders).mockReset();
  vi.mocked(beginSocialSignIn).mockReset();
});
afterEach(cleanup);

const dob = { day: "4", month: "9", year: "1990" };

describe("Login", () => {
  it("shows no social buttons and no divider when no provider is enabled", async () => {
    vi.mocked(getEnabledSocialProviders).mockResolvedValue([]);
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    await waitFor(() => expect(getEnabledSocialProviders).toHaveBeenCalled());
    expect(screen.queryByText("Or continue with")).toBeNull();
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
    // The password form is unaffected.
    expect(screen.getByRole("button", { name: "Log in" })).not.toBeNull();
  });

  it("shows Google and Facebook below the form and passes the Stay signed in choice", async () => {
    vi.mocked(getEnabledSocialProviders).mockResolvedValue(["google", "facebook"]);
    vi.mocked(beginSocialSignIn).mockResolvedValue(undefined);
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    fireEvent.click(screen.getByLabelText("Stay signed in."));
    fireEvent.click(await screen.findByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(beginSocialSignIn).toHaveBeenCalledWith("google", true));
    expect(screen.getByRole("button", { name: "Continue with Facebook" })).not.toBeNull();
    expect(screen.queryByText(/apple/i)).toBeNull();
  });
});

describe("Register", () => {
  it("shows no social buttons when no provider is enabled", async () => {
    vi.mocked(getEnabledSocialProviders).mockResolvedValue([]);
    render(<MemoryRouter><RegisterStep dob={dob} country="GB" isMinor={false} guardianDetails={null} /></MemoryRouter>);
    await waitFor(() => expect(getEnabledSocialProviders).toHaveBeenCalled());
    expect(screen.queryByText("Or continue with")).toBeNull();
    expect(screen.getByRole("button", { name: "Create account" })).not.toBeNull();
  });

  it("shows Google and Facebook when enabled", async () => {
    vi.mocked(getEnabledSocialProviders).mockResolvedValue(["google", "facebook"]);
    render(<MemoryRouter><RegisterStep dob={dob} country="GB" isMinor={false} guardianDetails={null} /></MemoryRouter>);
    expect(await screen.findByRole("button", { name: "Continue with Google" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Continue with Facebook" })).not.toBeNull();
  });
});
