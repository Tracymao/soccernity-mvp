// Create Profile with the username-review card (B-139 part (c), Decision Log #467): the card sits above
// the form, the username form still works, and a reinstatement moves the person on through the server's
// own onboarding state.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import CreateProfilePage from "./CreateProfilePage";

vi.mock("../api/users", async () => {
  const actual = await vi.importActual<typeof import("../api/users")>("../api/users");
  return { ...actual, getUser: vi.fn(), updateUser: vi.fn() };
});
vi.mock("../api/usernameReview", async () => {
  const actual = await vi.importActual<typeof import("../api/usernameReview")>("../api/usernameReview");
  return { ...actual, getUsernameReviewStatus: vi.fn(), requestUsernameReview: vi.fn() };
});
import { getUser, updateUser } from "../api/users";
import { getUsernameReviewStatus } from "../api/usernameReview";
import { seedSession, clearSession } from "../test/session";

function b64(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const TOKEN = `${b64({ alg: "none" })}.${b64({ sub: "user-1", role: "fan" })}.sig`;

const PROFILE = {
  nextStep: "create_profile",
  displayName: "Ade Bello",
  username: null,
  dateOfBirth: "2011-09-04T00:00:00.000Z",
  profileCountry: null,
  bio: null,
  preferredClub: null,
  avatar: null,
  cover: null,
} as unknown as Awaited<ReturnType<typeof getUser>>;

afterEach(cleanup);
beforeEach(() => {
  clearSession();
  seedSession(TOKEN);
  vi.mocked(getUser).mockReset().mockResolvedValue(PROFILE);
  vi.mocked(updateUser).mockReset();
  vi.mocked(getUsernameReviewStatus).mockReset();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/create-profile"]}>
      <Routes>
        <Route path="/create-profile" element={<CreateProfilePage />} />
        <Route path="/signup/clubs" element={<p>club picker page</p>} />
        <Route path="/guardian-consent" element={<p>restricted pending page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CreateProfilePage with a removed username", () => {
  it("shows the Ask for a review card above the form and keeps the username field usable", async () => {
    vi.mocked(getUsernameReviewStatus).mockResolvedValue({ state: "can_request", requestableUntil: null });
    renderPage();
    const ask = await screen.findByRole("button", { name: "Ask for a review" });
    const username = screen.getByLabelText(/Username/) as HTMLInputElement;
    // The card comes before the username field in the page.
    expect(ask.compareDocumentPosition(username) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(username.disabled).toBe(false);
  });

  it("shows no card for an account with nothing to review", async () => {
    vi.mocked(getUsernameReviewStatus).mockResolvedValue({ state: "none", requestableUntil: null });
    renderPage();
    await screen.findByLabelText("First name");
    await waitFor(() => expect(getUsernameReviewStatus).toHaveBeenCalled());
    expect(screen.queryByText("Your username was removed")).toBeNull();
    expect(screen.queryByRole("button", { name: "Ask for a review" })).toBeNull();
  });

  it("after a declined review the person can still choose a new username and continue", async () => {
    vi.mocked(getUsernameReviewStatus).mockResolvedValue({ state: "declined", requestableUntil: null });
    vi.mocked(updateUser).mockResolvedValue(PROFILE);
    renderPage();
    await screen.findByRole("heading", { name: "Review decided" });
    fireEvent.change(screen.getByLabelText(/Username/), { target: { value: "new_name" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(updateUser).toHaveBeenCalled());
    expect(await screen.findByText("club picker page")).not.toBeNull();
  });

  it("a reinstatement (pending request gone, the server's nextStep no longer create_profile) moves the person on", async () => {
    vi.mocked(getUsernameReviewStatus).mockResolvedValue({ state: "pending", requestableUntil: null });
    renderPage();
    await screen.findByText("Pending");

    // The review was approved: the account has its username back, so the server's own state moves on.
    vi.mocked(getUsernameReviewStatus).mockResolvedValue({ state: "none", requestableUntil: null });
    vi.mocked(getUser).mockResolvedValue({ ...PROFILE, nextStep: "none", username: "adab" } as typeof PROFILE);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(await screen.findByText("club picker page")).not.toBeNull();
  });

  it("a reinstated person whose account is restricted-pending is sent where the server's state says", async () => {
    vi.mocked(getUsernameReviewStatus).mockResolvedValue({ state: "pending", requestableUntil: null });
    renderPage();
    await screen.findByText("Pending");
    vi.mocked(getUsernameReviewStatus).mockResolvedValue({ state: "none", requestableUntil: null });
    vi.mocked(getUser).mockResolvedValue({ ...PROFILE, nextStep: "restricted_pending" } as typeof PROFILE);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(await screen.findByText("restricted pending page")).not.toBeNull();
  });
});
