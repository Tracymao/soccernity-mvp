import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import ClubRepresentationPage from "./ClubRepresentationPage";
import type { ClubSummary } from "../../api/clubs";
import type { UserProfile } from "../../api/users";

vi.mock("../../api/clubs", async () => {
  const actual = await vi.importActual<typeof import("../../api/clubs")>("../../api/clubs");
  return { ...actual, listClubs: vi.fn() };
});

vi.mock("../../api/users", async () => {
  const actual = await vi.importActual<typeof import("../../api/users")>("../../api/users");
  return { ...actual, getUser: vi.fn(), setRepresentedClub: vi.fn() };
});

import { listClubs } from "../../api/clubs";
import { getUser, setRepresentedClub, UsersApiError } from "../../api/users";

function base64UrlEncode(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fakeAccessToken(sub = "user-1"): string {
  return `${base64UrlEncode({ alg: "none" })}.${base64UrlEncode({ sub, role: "fan" })}.sig`;
}

const IKOYI: ClubSummary = {
  id: "club-ikoyi",
  name: "Ikoyi Rovers FC",
  league: "Lagos Sunday League",
  country: "Nigeria",
  logoUrl: null,
  memberCount: 12,
  joined: true,
};

const SURULERE: ClubSummary = {
  id: "club-surulere",
  name: "Surulere United",
  league: null,
  country: null,
  logoUrl: null,
  memberCount: 4,
  joined: true,
};

const NOT_JOINED: ClubSummary = {
  id: "club-other",
  name: "Yaba Athletic",
  league: null,
  country: null,
  logoUrl: null,
  memberCount: 5,
  joined: false,
};

function profile(represented: { id: string; name: string } | null): UserProfile {
  return {
    id: "user-1",
    email: "fan@example.com",
    phone: null,
    displayName: "Fan",
    username: null,
    publicName: "Fan",
    dateOfBirth: "1998-07-04",
    isMinor: false,
    role: "fan",
    verificationStatus: "unverified",
    createdAt: new Date().toISOString(),
    clubAffiliationId: null,
    isTeamOrganiser: false,
    representedClub: represented,
  };
}

afterEach(cleanup);

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(listClubs).mockReset();
  vi.mocked(getUser).mockReset();
  vi.mocked(setRepresentedClub).mockReset();
});

function renderPage() {
  render(
    <MemoryRouter>
      <ClubRepresentationPage />
    </MemoryRouter>,
  );
}

describe("ClubRepresentationPage", () => {
  it("shows a log-in prompt and never calls the API with no session", () => {
    renderPage();

    expect(screen.getByRole("status").textContent).toMatch(/log in to choose your represented club/i);
    expect(listClubs).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("lists only joined clubs and pre-selects the real represented club", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(listClubs).mockResolvedValueOnce({ items: [IKOYI, NOT_JOINED, SURULERE], nextCursor: null });
    vi.mocked(getUser).mockResolvedValueOnce(profile({ id: SURULERE.id, name: SURULERE.name }));

    renderPage();

    const radios = (await screen.findAllByRole("radio")) as HTMLInputElement[];
    expect(radios.map((r) => r.value)).toEqual([IKOYI.id, SURULERE.id]);
    expect(radios.find((r) => r.value === SURULERE.id)?.checked).toBe(true);
    expect(radios.find((r) => r.value === IKOYI.id)?.checked).toBe(false);
    expect(screen.getByText(/· Represented/)).not.toBeNull();
    expect(getUser).toHaveBeenCalledWith(expect.any(String), "user-1");
  });

  it("walks every cursor page so a club beyond the first page is still offered", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(listClubs)
      .mockResolvedValueOnce({ items: [IKOYI], nextCursor: "page-2" })
      .mockResolvedValueOnce({ items: [SURULERE], nextCursor: null });
    vi.mocked(getUser).mockResolvedValueOnce(profile(null));

    renderPage();

    expect(await screen.findByRole("radio", { name: /surulere united/i })).not.toBeNull();
    expect(listClubs).toHaveBeenNthCalledWith(2, expect.any(String), "page-2");
  });

  it("with no represented club and no change made, the save button stays disabled", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(listClubs).mockResolvedValueOnce({ items: [IKOYI], nextCursor: null });
    vi.mocked(getUser).mockResolvedValueOnce(profile(null));

    renderPage();

    const save = await screen.findByRole("button", { name: "Save represented club" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
  });

  it("choosing a club and saving calls PATCH with that id and confirms the new value", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(listClubs).mockResolvedValueOnce({ items: [IKOYI, SURULERE], nextCursor: null });
    vi.mocked(getUser).mockResolvedValueOnce(profile({ id: IKOYI.id, name: IKOYI.name }));
    vi.mocked(setRepresentedClub).mockResolvedValueOnce({ representedClub: { id: SURULERE.id, name: SURULERE.name } });

    renderPage();

    fireEvent.click(await screen.findByRole("radio", { name: /surulere united/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save represented club" }));

    await waitFor(() => expect(setRepresentedClub).toHaveBeenCalledWith(expect.any(String), "user-1", SURULERE.id));
    expect(await screen.findByText("Saved. You now represent Surulere United.")).not.toBeNull();
    expect((screen.getByRole("button", { name: "Save represented club" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a rejected save shows the server's message and keeps the choice selected for retry", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(listClubs).mockResolvedValueOnce({ items: [IKOYI, SURULERE], nextCursor: null });
    vi.mocked(getUser).mockResolvedValueOnce(profile(null));
    vi.mocked(setRepresentedClub).mockRejectedValueOnce(
      new UsersApiError("You can only represent a club you have joined", { status: 400 }),
    );

    renderPage();

    fireEvent.click(await screen.findByRole("radio", { name: /ikoyi rovers fc/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save represented club" }));

    expect((await screen.findByRole("alert")).textContent).toBe("You can only represent a club you have joined");
    expect((screen.getByRole("radio", { name: /ikoyi rovers fc/i }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("button", { name: "Save represented club" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("with zero joined clubs shows an honest empty state with a route to browse, and no save control", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(listClubs).mockResolvedValueOnce({ items: [NOT_JOINED], nextCursor: null });
    vi.mocked(getUser).mockResolvedValueOnce(profile(null));

    renderPage();

    expect(await screen.findByText(/haven.t joined any club pages yet/i)).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Save represented club" })).toBeNull();
    expect(screen.getByRole("link", { name: "Browse clubs" }).getAttribute("href")).toBe("/clubs");
  });

  it("a failed load shows an error with a retry, rather than a blank page", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(listClubs).mockRejectedValueOnce(new Error("network down"));
    vi.mocked(getUser).mockResolvedValueOnce(profile(null));

    renderPage();

    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn.t load your clubs/i);
    expect(screen.getByRole("button", { name: "Try again" })).not.toBeNull();
  });
});
