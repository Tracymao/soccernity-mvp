// B-295 (Decision Log #485; Figma pass U 7045:63053 to 7045:63452): suspending an account from the user page, and the
// API body rule behind it. A suspension needs one of the nine reason categories (the API answers 400
// suspension_reason_category_required without it); every other status change sends no category.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { AdminApiError } from "../../api/adminClient";

vi.mock("../../api/adminUsers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/adminUsers")>();
  return { ...actual, getUserSummary: vi.fn(), updateUserStatus: vi.fn() };
});

import { getUserSummary, updateUserStatus, type AdminUserSummary } from "../../api/adminUsers";
import UserDetailPage from "./UserDetailPage";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(getUserSummary).mockReset();
  vi.mocked(updateUserStatus).mockReset();
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
    isMinor: false,
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
}

const suspendRow = () => screen.queryByRole("button", { name: "Suspend account" });

describe("User page: Suspend account", () => {
  it("shows the row with its description for an active account", async () => {
    vi.mocked(getUserSummary).mockResolvedValue(summary());
    await renderPage();
    expect(suspendRow()).not.toBeNull();
    expect(screen.getByText("Suspend this account. A reason category is required.")).toBeTruthy();
  });

  it("does not offer it on a suspended or a removed account", async () => {
    vi.mocked(getUserSummary).mockResolvedValue(summary({ accountStatus: "suspended" }));
    await renderPage();
    expect(suspendRow()).toBeNull();
    expect(screen.getByText("This account is suspended.")).toBeTruthy();
    cleanup();

    vi.mocked(getUserSummary).mockResolvedValue(summary({ accountStatus: "deleted", username: null }));
    await renderPage();
    expect(suspendRow()).toBeNull();
    expect(screen.queryByText("This account is suspended.")).toBeNull();
  });

  it("opens the dialog with the consequence list and all nine categories, none chosen", async () => {
    vi.mocked(getUserSummary).mockResolvedValue(summary());
    await renderPage();
    fireEvent.click(suspendRow()!);

    const dialog = await screen.findByRole("dialog", { name: "Suspend this account?" });
    expect(within(dialog).getByText(/Suspend the account of Ada Bello\?/)).toBeTruthy();
    expect(within(dialog).getByText(/every session they have ends now/)).toBeTruthy();
    expect(within(dialog).getByText(/the category you choose/)).toBeTruthy();
    expect(within(dialog).getByText(/can reinstate the account from this page/)).toBeTruthy();
    const radios = within(dialog).getAllByRole("radio");
    expect(radios).toHaveLength(9);
    expect(radios.every((r) => !(r as HTMLInputElement).checked)).toBe(true);
    expect(within(dialog).getByText(/For Child safety concern and Other it says/)).toBeTruthy();
    // Decision Log #497 (B-301): the five consequence sentences and the category help carry the literal tag.
    const items = within(dialog).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    for (const item of items) expect(item.textContent).toMatch(/ \[COPY PENDING LEGAL REVIEW\]$/);
    expect(within(dialog).getByText(/For Child safety concern and Other it says/).textContent).toMatch(/ \[COPY PENDING LEGAL REVIEW\]$/);
  });

  it("will not send without a category: shows the error and sends nothing", async () => {
    vi.mocked(getUserSummary).mockResolvedValue(summary());
    await renderPage();
    fireEvent.click(suspendRow()!);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Suspend account" }));

    expect(await within(dialog).findByText("Choose a reason category.")).toBeTruthy();
    expect(updateUserStatus).not.toHaveBeenCalled();
  });

  it("sends the chosen category, closes, says so and reloads the page", async () => {
    vi.mocked(getUserSummary).mockResolvedValueOnce(summary());
    vi.mocked(updateUserStatus).mockResolvedValueOnce({ deleted: false, user: {} as never });
    await renderPage();
    fireEvent.click(suspendRow()!);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: "Spam or scam" }));
    vi.mocked(getUserSummary).mockResolvedValue(summary({ accountStatus: "suspended" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Suspend account" }));

    await waitFor(() => expect(updateUserStatus).toHaveBeenCalledWith("user-1", "suspended", "spam_or_scam"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText(/Account suspended\. The account can no longer sign in/)).toBeTruthy();
    expect(screen.getByText(/Account suspended\. The account can no longer sign in/).textContent).toMatch(/ \[COPY PENDING LEGAL REVIEW\]$/);
    await waitFor(() => expect(screen.getByText("This account is suspended.")).toBeTruthy());
    expect(getUserSummary).toHaveBeenCalledTimes(2);
  });

  it("shows the server's own message for a 4xx and keeps the dialog and the choice", async () => {
    vi.mocked(getUserSummary).mockResolvedValue(summary());
    vi.mocked(updateUserStatus).mockRejectedValueOnce(
      new AdminApiError(400, "A reason category is required to suspend an account.", {
        code: "suspension_reason_category_required",
      }),
    );
    await renderPage();
    fireEvent.click(suspendRow()!);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: "Other" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Suspend account" }));

    expect(await within(dialog).findByText("A reason category is required to suspend an account.")).toBeTruthy();
    expect((within(dialog).getByRole("radio", { name: "Other" }) as HTMLInputElement).checked).toBe(true);
  });
});
