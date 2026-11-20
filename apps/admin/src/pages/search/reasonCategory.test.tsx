// B-284 (Decision Log #465): the Reports group of admin search shows REASON CATEGORY from the server's
// `reasonCategory` and labels the server's `reason_category` matchedOn key (Figma 6947:41433 / 6947:41607).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

vi.mock("../../api/adminSearch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/adminSearch")>();
  return { ...actual, adminSearch: vi.fn() };
});

import { adminSearch, type SearchReportHit } from "../../api/adminSearch";
import SearchPage from "./SearchPage";

const search = vi.mocked(adminSearch);
beforeEach(() => search.mockReset());
afterEach(cleanup);

function hit(overrides: Partial<SearchReportHit> = {}): SearchReportHit {
  return {
    matchedOn: "reason_category",
    id: "33333333-bbbb-4bbb-8bbb-333333333333",
    targetType: "user",
    targetId: "u1",
    status: "open",
    severity: "medium",
    concernsMinor: false,
    reasonCategory: "impersonation_or_fake_account",
    createdAt: "2026-10-01T10:00:00.000Z",
    source: null,
    ...overrides,
  };
}

function renderResults(items: SearchReportHit[]) {
  search.mockResolvedValue({ groups: { reports: { items, truncated: false } } });
  return render(
    <MemoryRouter initialEntries={["/search?q=impersonation"]}>
      <Routes>
        <Route path="/search" element={<SearchPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function reportsTable() {
  return within(await screen.findByRole("table", { name: "Reports" }));
}

describe("SearchPage: Reports group, reason category", () => {
  it("has a 'Reason category' column after Type, before Status, and shows the label", async () => {
    renderResults([hit()]);
    const table = await reportsTable();
    const headers = table.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers.slice(0, 4)).toEqual(["Report", "Type", "Reason category", "Status"]);
    expect(table.getAllByText("Impersonation or fake account").length).toBe(1);
  });

  it("labels the server's reason_category matchedOn key 'Reason category'", async () => {
    renderResults([hit()]);
    const table = await reportsTable();
    // One column header, and one matched-on cell reading the same words.
    expect(table.getAllByText("Reason category").length).toBe(2);
    const row = table.getAllByRole("row")[1];
    expect(within(row).getByText("Reason category")).not.toBeNull();
  });

  it("shows 'Not categorised' for a hit whose reasonCategory is null", async () => {
    renderResults([hit({ matchedOn: "target_username", reasonCategory: null })]);
    const table = await reportsTable();
    expect(table.getByText("Not categorised")).not.toBeNull();
    expect(table.getByText("Target username")).not.toBeNull();
  });

  it("shows each hit's own category", async () => {
    renderResults([
      hit({ id: "aaaaaaaa-0000-4000-8000-000000000001", reasonCategory: "spam_or_scam" }),
      hit({ id: "bbbbbbbb-0000-4000-8000-000000000002", reasonCategory: "other" }),
    ]);
    const table = await reportsTable();
    expect(table.getByText("Spam or scam")).not.toBeNull();
    expect(table.getByText("Other")).not.toBeNull();
  });

  it("shows the helper line that names reason category", async () => {
    renderResults([hit()]);
    expect(
      await screen.findByText(
        "Email lookups need the full address, for example name@example.com. Reports can be found by reference, username or reason category.",
      ),
    ).not.toBeNull();
  });
});
