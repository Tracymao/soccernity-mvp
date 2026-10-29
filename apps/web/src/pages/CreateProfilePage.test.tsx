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
import { seedSession, clearSession } from "../test/session";

function b64(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fakeToken(sub = "user-1"): string {
  return `${b64({ alg: "none" })}.${b64({ sub, role: "fan" })}.sig`;
}

afterEach(cleanup);
beforeEach(() => {
  clearSession();
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

  function continueButton() {
    return screen.getByRole("button", { name: "Continue" });
  }

  it("renders every field: picture, cover, name, username, read-only date of birth, blank optional country, bio and club", async () => {
    seedSession(fakeToken("user-1"));
    vi.mocked(getUser).mockResolvedValue(PROFILE);
    renderPage();

    expect(((await screen.findByLabelText("First name")) as HTMLInputElement).value).toBe("Ade");
    expect((screen.getByLabelText("Last name") as HTMLInputElement).value).toBe("Bello");
    const dob = screen.getByLabelText("Date of Birth") as HTMLInputElement;
    expect(dob.readOnly).toBe(true);
    expect(dob.value).toBe("04 / 09 / 2011");
    // Country is optional, editable and BLANK at first (Decision Log #403 item 17).
    const country = screen.getByLabelText(/Country/) as HTMLSelectElement;
    expect(country.value).toBe("");
    expect(country.disabled).toBe(false);
    expect(screen.getByLabelText(/Bio/)).not.toBeNull();
    expect(screen.getByLabelText(/Preferred Club/)).not.toBeNull();
    expect(screen.getAllByText(/profile picture/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/cover photo/i).length).toBeGreaterThan(0);
  });

  it("D-18: a slow profile read never wipes what was typed, but still fills untouched fields", async () => {
    seedSession(fakeToken("user-1"));
    let resolveUser: (value: typeof PROFILE) => void = () => undefined;
    vi.mocked(getUser).mockReturnValue(new Promise((resolve) => (resolveUser = resolve)));
    renderPage();

    fireEvent.change(screen.getByLabelText(/^Username/), { target: { value: "typed_before_load" } });
    fireEvent.change(screen.getByLabelText(/Bio/), { target: { value: "typed bio" } });
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Typed" } });

    resolveUser({ ...PROFILE, username: "from_server", bio: "server bio", preferredClub: "Server FC" });

    // An untouched field is filled from the server...
    await waitFor(() => expect((screen.getByLabelText(/Preferred Club/) as HTMLInputElement).value).toBe("Server FC"));
    expect((screen.getByLabelText("Last name") as HTMLInputElement).value).toBe("Bello");
    // ...and the touched ones keep what the person typed.
    expect((screen.getByLabelText(/^Username/) as HTMLInputElement).value).toBe("typed_before_load");
    expect((screen.getByLabelText(/Bio/) as HTMLTextAreaElement).value).toBe("typed bio");
    expect((screen.getByLabelText("First name") as HTMLInputElement).value).toBe("Typed");
  });

  it("saves the profile (username required), then goes to the Club Picker", async () => {
    seedSession(fakeToken("user-1"));
    vi.mocked(getUser).mockResolvedValue(PROFILE);
    vi.mocked(updateUser).mockResolvedValue({} as Awaited<ReturnType<typeof updateUser>>);
    renderPage();

    fireEvent.change(await screen.findByLabelText(/^Username/), { target: { value: "tobi_9" } });
    fireEvent.change(screen.getByLabelText(/Country/), { target: { value: "NG" } });
    fireEvent.change(screen.getByLabelText(/Bio/), { target: { value: "Winger from Lagos" } });
    fireEvent.change(screen.getByLabelText(/Preferred Club/), { target: { value: "Ikoyi Rovers" } });
    fireEvent.click(continueButton());

    await waitFor(() => expect(updateUser).toHaveBeenCalledTimes(1));
    expect(vi.mocked(updateUser).mock.calls[0]).toEqual([
      expect.any(String),
      "user-1",
      {
        displayName: "Ade Bello",
        username: "tobi_9",
        profileCountry: "NG",
        bio: "Winger from Lagos",
        preferredClub: "Ikoyi Rovers",
      },
    ]);
    expect(await screen.findByText("club picker page")).not.toBeNull();
  });

  it("rejects a malformed username locally and never calls the API", async () => {
    seedSession(fakeToken());
    vi.mocked(getUser).mockResolvedValue(PROFILE);
    renderPage();

    fireEvent.change(await screen.findByLabelText(/^Username/), { target: { value: "no spaces!" } });
    fireEvent.click(continueButton());

    expect((await screen.findByRole("alert")).textContent).toMatch(/3-30 characters/i);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("shows the server's own message when the username is refused", async () => {
    seedSession(fakeToken());
    vi.mocked(getUser).mockResolvedValue(PROFILE);
    vi.mocked(updateUser).mockRejectedValue(new UsersApiError("That username isn't available.", { status: 409 }));
    renderPage();

    fireEvent.change(await screen.findByLabelText(/^Username/), { target: { value: "taken_name" } });
    fireEvent.click(continueButton());

    expect((await screen.findByRole("alert")).textContent).toBe("That username isn't available.");
    expect(screen.queryByText("club picker page")).toBeNull();
  });

  it("a flagged bio shows 'Please rephrase', keeps the typed text and has no override", async () => {
    seedSession(fakeToken());
    vi.mocked(getUser).mockResolvedValue(PROFILE);
    vi.mocked(updateUser).mockRejectedValue(
      new UsersApiError("Please rephrase.", {
        status: 422,
        code: "sensitive_content_rephrase_required",
        flaggedFields: [{ field: "bio", categories: ["health"] }],
      }),
    );
    renderPage();

    fireEvent.change(await screen.findByLabelText(/^Username/), { target: { value: "tobi_9" } });
    fireEvent.change(screen.getByLabelText(/Bio/), { target: { value: "my typed bio" } });
    fireEvent.click(continueButton());

    expect(await screen.findByText("Please rephrase")).not.toBeNull();
    expect((screen.getByLabelText(/Bio/) as HTMLTextAreaElement).value).toBe("my typed bio");
    expect(screen.queryByRole("button", { name: /anyway|override|confirm/i })).toBeNull();
    expect(screen.queryByText("club picker page")).toBeNull();

    // Editing the flagged field clears its flag; the next save is screened again by the server.
    fireEvent.change(screen.getByLabelText(/Bio/), { target: { value: "a different bio" } });
    expect(screen.queryByText("Please rephrase")).toBeNull();
  });

  it("sends a restricted-pending account back to /guardian-consent instead of showing the form", async () => {
    seedSession(fakeToken());
    vi.mocked(getUser).mockResolvedValue({ nextStep: "restricted_pending" } as Awaited<ReturnType<typeof getUser>>);
    renderPage();
    expect(await screen.findByText("restricted pending page")).not.toBeNull();
  });

  it("sends an unverified account back to the verify prompt", async () => {
    seedSession(fakeToken());
    vi.mocked(getUser).mockResolvedValue({ nextStep: "verify_email" } as Awaited<ReturnType<typeof getUser>>);
    renderPage();
    expect(await screen.findByText("verify prompt page")).not.toBeNull();
  });

  it("moves an account whose profile is already complete on to the Club Picker", async () => {
    seedSession(fakeToken());
    vi.mocked(getUser).mockResolvedValue({ nextStep: "none" } as Awaited<ReturnType<typeof getUser>>);
    renderPage();
    expect(await screen.findByText("club picker page")).not.toBeNull();
  });
});
