// CreateCommunityGroupPage (Create a Community Group). Same conventions
// as GrassrootsRegisterTeamPage.test.tsx: plain DOM assertions, mocks
// src/api/community-groups.ts, session seeded into sessionStorage.
// POST /community-groups is a real merged endpoint -- exercising it live
// is services/api's e2e layer's job (test/community-groups.e2e-spec.ts).
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import CreateCommunityGroupPage from "./CreateCommunityGroupPage";
import { CommunityGroupsApiError, type CommunityGroup } from "../api/community-groups";

vi.mock("../api/community-groups", async () => {
  const actual = await vi.importActual<typeof import("../api/community-groups")>("../api/community-groups");
  return { ...actual, createCommunityGroup: vi.fn() };
});

import { createCommunityGroup } from "../api/community-groups";

const CREATED: CommunityGroup = {
  id: "group-new",
  name: "Lagos Mainland Ballers",
  city: "Lagos",
  positionPlayed: null,
  careerTrack: null,
  createdById: "user-1",
  memberCount: 1,
  createdAt: "2026-09-14T00:00:00.000Z",
  joined: true,
};

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(createCommunityGroup).mockReset();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/groups/new"]}>
      <Routes>
        <Route path="/groups/new" element={<CreateCommunityGroupPage />} />
        <Route path="/groups/:groupId" element={<div data-testid="group-page">group page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CreateCommunityGroupPage", () => {
  it("shows a log-in prompt and never calls the API with no session", () => {
    renderPage();
    expect(screen.getByText(/log in to create a group/i)).not.toBeNull();
    expect(createCommunityGroup).not.toHaveBeenCalled();
  });

  it("defaults to the City dimension, disables submit until name + value are filled, and does NOT render a description field", () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    renderPage();

    expect(screen.getByRole("radio", { name: "City", checked: true })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Create group" }).hasAttribute("disabled")).toBe(true);
    // No description field -- CommunityGroup has no such column (see this
    // page's own header comment).
    expect(screen.queryByLabelText(/description/i)).toBeNull();
    expect(screen.getByText(/no group photo or logo/i)).not.toBeNull();
  });

  it("submits exactly one dimension (the selected one) and navigates to the new group's page", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(createCommunityGroup).mockResolvedValueOnce(CREATED);

    renderPage();

    fireEvent.change(screen.getByLabelText(/group name/i), { target: { value: "Lagos Mainland Ballers" } });
    fireEvent.change(screen.getByLabelText(/^city \(required\)$/i), { target: { value: "Lagos" } });
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));

    await waitFor(() =>
      expect(createCommunityGroup).toHaveBeenCalledWith("test-token", {
        name: "Lagos Mainland Ballers",
        city: "Lagos",
      }),
    );
    expect(await screen.findByTestId("group-page")).not.toBeNull();
  });

  it("swaps the value field when a different Group type is chosen, and submits that dimension instead", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(createCommunityGroup).mockResolvedValueOnce({
      ...CREATED,
      city: null,
      positionPlayed: "Striker",
    });

    renderPage();

    fireEvent.click(screen.getByRole("radio", { name: "Position" }));
    expect(screen.getByLabelText(/^position \(required\)$/i)).not.toBeNull();

    fireEvent.change(screen.getByLabelText(/group name/i), { target: { value: "Strikers' Union" } });
    fireEvent.change(screen.getByLabelText(/^position \(required\)$/i), { target: { value: "Striker" } });
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));

    await waitFor(() =>
      expect(createCommunityGroup).toHaveBeenCalledWith("test-token", {
        name: "Strikers' Union",
        positionPlayed: "Striker",
      }),
    );
  });

  it("shows a guardian-consent message and a link to /guardian-consent on a 403 from GuardianConsentGuard", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(createCommunityGroup).mockRejectedValueOnce(
      new CommunityGroupsApiError(
        "This account is awaiting guardian consent and cannot access this feature yet.",
        { status: 403 },
      ),
    );

    renderPage();
    fireEvent.change(screen.getByLabelText(/group name/i), { target: { value: "Lagos Mainland Ballers" } });
    fireEvent.change(screen.getByLabelText(/^city \(required\)$/i), { target: { value: "Lagos" } });
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));

    expect(await screen.findByText(/awaiting guardian consent/i)).not.toBeNull();
    expect(screen.getByRole("link", { name: /check your consent status/i }).getAttribute("href")).toBe(
      "/guardian-consent",
    );
  });

  it("shows a plain, threshold-free message on an under-16 restricted 403", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(createCommunityGroup).mockRejectedValueOnce(
      new CommunityGroupsApiError("This isn't available for your account yet.", {
        status: 403,
        code: "under_16_restricted",
      }),
    );

    renderPage();
    fireEvent.change(screen.getByLabelText(/group name/i), { target: { value: "Lagos Mainland Ballers" } });
    fireEvent.change(screen.getByLabelText(/^city \(required\)$/i), { target: { value: "Lagos" } });
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));

    expect(await screen.findByText("This isn't available for your account yet.")).not.toBeNull();
    expect(screen.queryByRole("link", { name: /check your consent status/i })).toBeNull();
  });

  it("surfaces the server's own duplicate-name 409 message inline", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(createCommunityGroup).mockRejectedValueOnce(
      new CommunityGroupsApiError("A Community Group with this name already exists", { status: 409 }),
    );

    renderPage();
    fireEvent.change(screen.getByLabelText(/group name/i), { target: { value: "Lagos Mainland Ballers" } });
    fireEvent.change(screen.getByLabelText(/^city \(required\)$/i), { target: { value: "Lagos" } });
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));

    expect(await screen.findByText(/already exists/i)).not.toBeNull();
  });
});
