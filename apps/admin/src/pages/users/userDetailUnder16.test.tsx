// B-172 (Decision Log #462 item (e)): the User Detail page shows the under-16 flag
// the summary endpoint already returns. Figma frames 6950:40855 (18 or over),
// 6950:41024 (under 18, 16 or over), 6950:41191 (under 16).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

vi.mock("../../api/adminUsers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/adminUsers")>();
  return { ...actual, getUserDetail: vi.fn(), getUserSummary: vi.fn(), revokeUsername: vi.fn() };
});

import { getUserDetail, getUserSummary, revokeUsername, type AdminUserSummary } from "../../api/adminUsers";
import UserDetailPage from "./UserDetailPage";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(getUserDetail).mockReset();
  vi.mocked(getUserSummary).mockReset();
  vi.mocked(revokeUsername).mockReset();
});

function summary(overrides: Partial<AdminUserSummary> = {}): AdminUserSummary {
  return {
    id: "user-1",
    email: "ada.bello@example.com",
    displayName: "Ada Bello",
    username: "adab",
    role: "fan",
    accountStatus: "active",
    verificationStatus: "verified",
    isMinor: true,
    isUnder16: false,
    createdAt: "2026-09-03T10:00:00.000Z",
    pendingDeletionAt: null,
    safeguardingCountry: { declared: "GB", derived: "GB", method: "geoip", derivedAt: null },
    guardian: null,
    usernameRevocations: [],
    ...overrides,
  };
}

async function renderPage() {
  render(
    <MemoryRouter initialEntries={["/users/user-1"]}>
      <Routes>
        <Route path="/users/:id" element={<UserDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: "Ada Bello" });
  return screen.getByRole("region", { name: "Account" });
}

// The value of the Account card row with this label.
function rowValue(account: HTMLElement, label: string): string | null {
  const term = within(account).queryByText(label, { selector: "dt" });
  return term?.nextElementSibling?.textContent ?? null;
}

describe("UserDetailPage: Under 16 row", () => {
  it.each([
    ["an adult (18 or over)", { isMinor: false, isUnder16: false }, "18 or over", "No"],
    ["a minor of 16 or 17 (under 18, not under 16)", { isMinor: true, isUnder16: false }, "Under 18", "No"],
    ["a child under 16", { isMinor: true, isUnder16: true }, "Under 18", "Yes"],
  ])("%s", async (_name, flags, ageGroup, under16) => {
    vi.mocked(getUserSummary).mockResolvedValue(summary(flags));
    const account = await renderPage();
    expect(rowValue(account, "Age group")).toBe(ageGroup);
    expect(rowValue(account, "Under 16")).toBe(under16);
  });

  it("places the row directly after Age group, in the Account card", async () => {
    vi.mocked(getUserSummary).mockResolvedValue(summary({ isUnder16: true }));
    const account = await renderPage();
    const labels = Array.from(account.querySelectorAll("dt")).map((dt) => dt.textContent);
    expect(labels.indexOf("Under 16")).toBe(labels.indexOf("Age group") + 1);
  });

  it("shows the server's flag as returned, never derived from the age group", async () => {
    // An impossible-looking combination on purpose: if the page derived the answer from isMinor it would say No.
    vi.mocked(getUserSummary).mockResolvedValue(summary({ isMinor: false, isUnder16: true }));
    const account = await renderPage();
    expect(rowValue(account, "Age group")).toBe("18 or over");
    expect(rowValue(account, "Under 16")).toBe("Yes");
  });

  it("shows the flag for every account status, including a deactivated account", async () => {
    vi.mocked(getUserSummary).mockResolvedValue(summary({ accountStatus: "deactivated", isUnder16: true }));
    const account = await renderPage();
    expect(rowValue(account, "Under 16")).toBe("Yes");
  });

  it("keeps the row in the username-revoked state (the screen reloads the summary after a revoke)", async () => {
    vi.mocked(getUserSummary).mockResolvedValue(summary({ isUnder16: true }));
    vi.mocked(revokeUsername).mockResolvedValue({
      userId: "user-1",
      revokedUsername: "adab",
      heldUntil: "2026-11-18T00:00:00.000Z",
    });
    const account = await renderPage();
    expect(rowValue(account, "Under 16")).toBe("Yes");

    fireEvent.click(screen.getByRole("button", { name: "Revoke username" }));
    const dialog = await screen.findByRole("dialog");
    vi.mocked(getUserSummary).mockResolvedValue(summary({ username: null, isUnder16: true }));
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), {
      target: { value: "Impersonates a club official account" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Revoke username" }));

    await waitFor(() => expect(screen.getByText("No username")).not.toBeNull());
    const after = screen.getByRole("region", { name: "Account" });
    expect(rowValue(after, "Under 16")).toBe("Yes");
    expect(rowValue(after, "Age group")).toBe("Under 18");
  });

  it("never reads a date of birth for this row: only the summary endpoint is called, and no date of birth is on screen", async () => {
    vi.mocked(getUserSummary).mockResolvedValue(summary({ isUnder16: true }));
    await renderPage();
    expect(getUserSummary).toHaveBeenCalledTimes(1);
    expect(getUserDetail).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/date of birth:|born|\b(19|20)\d{2}-\d{2}-\d{2}\b/i);
    expect(screen.queryByText(/age tier|under_16/i)).toBeNull();
  });
});
