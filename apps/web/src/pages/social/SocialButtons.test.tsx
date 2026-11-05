// B-085: the "Or continue with" block. With no provider enabled (the launch default) NOTHING renders: no divider,
// no heading, no button. Apple never has a button.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../../api/socialAuth", async () => {
  const actual = await vi.importActual<typeof import("../../api/socialAuth")>("../../api/socialAuth");
  return { ...actual, getEnabledSocialProviders: vi.fn() };
});
vi.mock("../../lib/socialSignIn", () => ({ beginSocialSignIn: vi.fn() }));
import { getEnabledSocialProviders } from "../../api/socialAuth";
import { beginSocialSignIn } from "../../lib/socialSignIn";
import SocialButtons from "./SocialButtons";

beforeEach(() => {
  vi.mocked(getEnabledSocialProviders).mockReset();
  vi.mocked(beginSocialSignIn).mockReset();
});
afterEach(cleanup);

describe("SocialButtons", () => {
  it("renders nothing at all when no provider is enabled", async () => {
    vi.mocked(getEnabledSocialProviders).mockResolvedValue([]);
    const { container } = render(<SocialButtons />);
    await waitFor(() => expect(getEnabledSocialProviders).toHaveBeenCalled());
    // Let the (empty) answer land.
    await Promise.resolve();
    expect(container.innerHTML).toBe("");
    expect(screen.queryByText("Or continue with")).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("renders nothing while the providers are still loading", () => {
    vi.mocked(getEnabledSocialProviders).mockReturnValue(new Promise(() => undefined));
    const { container } = render(<SocialButtons />);
    expect(container.innerHTML).toBe("");
  });

  it("shows a button for Google and for Facebook, and never Apple", async () => {
    vi.mocked(getEnabledSocialProviders).mockResolvedValue(["google", "facebook"]);
    render(<SocialButtons />);
    expect(await screen.findByRole("button", { name: "Continue with Google" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Continue with Facebook" })).not.toBeNull();
    expect(screen.getByText("Or continue with")).not.toBeNull();
    expect(screen.queryByText(/apple/i)).toBeNull();
  });

  it("shows only the enabled provider", async () => {
    vi.mocked(getEnabledSocialProviders).mockResolvedValue(["facebook"]);
    render(<SocialButtons />);
    expect(await screen.findByRole("button", { name: "Continue with Facebook" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
  });

  it("starts the redirect with the Stay signed in choice", async () => {
    vi.mocked(getEnabledSocialProviders).mockResolvedValue(["google"]);
    vi.mocked(beginSocialSignIn).mockResolvedValue(undefined);
    render(<SocialButtons staySignedIn />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(beginSocialSignIn).toHaveBeenCalledWith("google", true));
  });

  it("shows an error and re-enables the buttons when the sign-in cannot start", async () => {
    vi.mocked(getEnabledSocialProviders).mockResolvedValue(["google", "facebook"]);
    vi.mocked(beginSocialSignIn).mockRejectedValue(new Error("nope"));
    render(<SocialButtons />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue with Google" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Couldn.t start the sign-in with Google/);
    expect((screen.getByRole("button", { name: "Continue with Facebook" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
