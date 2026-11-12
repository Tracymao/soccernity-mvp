// Audit log / My activity (Decision Log #464): both Figma variants, every state, the filters, paging, and that the
// page enforces nothing itself (the server decides which rows an admin gets).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { AdminApiError } from "../../api/adminClient";

vi.mock("../../api/adminActionLog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/adminActionLog")>();
  return { ...actual, listActionLog: vi.fn() };
});
vi.mock("../../api/adminStaff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/adminStaff")>();
  return { ...actual, listStaff: vi.fn() };
});
vi.mock("../../auth/AdminAuthContext", () => ({
  useOptionalAdminAuth: vi.fn(),
  useAdminAuth: vi.fn(),
}));

import { listActionLog, type ActionLogItem, type ActionLogPage } from "../../api/adminActionLog";
import { listStaff } from "../../api/adminStaff";
import { useOptionalAdminAuth } from "../../auth/AdminAuthContext";
import AuditLogPage from "./AuditLogPage";

const list = vi.mocked(listActionLog);
const staff = vi.mocked(listStaff);
const auth = vi.mocked(useOptionalAdminAuth);

function signInAs(role: string | null, extra: { childSafetyVetted?: boolean } = {}) {
  auth.mockReturnValue(
    role === null
      ? null
      : ({
          status: "authenticated",
          admin: { id: "me", email: "me@soccernity.com", fullName: "Me", role, ...extra },
        } as never),
  );
}

const STAFF_PAGE = {
  items: [
    { id: "a1", fullName: "Amara Okafor", email: "amara@soccernity.com", role: "moderator" },
    { id: "a2", fullName: "Dayo Adeleke", email: "dayo@soccernity.com", role: "superadmin" },
  ],
  nextCursor: null,
} as never;

beforeEach(() => {
  list.mockReset();
  staff.mockReset();
  staff.mockResolvedValue(STAFF_PAGE);
  signInAs("superadmin");
});
afterEach(cleanup);

function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/activity"]}>
      <Routes>
        <Route path="/activity" element={<AuditLogPage />} />
        <Route path="*" element={<p>elsewhere</p>} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

function row(over: Partial<ActionLogItem> = {}): ActionLogItem {
  return {
    id: `log-${Math.random().toString(36).slice(2)}`,
    createdAt: "2026-11-02T14:05:00.000Z",
    actor: { id: "a1", displayName: "Amara Okafor" },
    action: "report.actioned",
    targetType: "report",
    targetId: "11111111-aaaa-4aaa-8aaa-111111111111",
    notes: "Content removed",
    ...over,
  };
}

const page = (items: ActionLogItem[], nextCursor: string | null = null): ActionLogPage => ({ items, nextCursor });

describe("Audit log (superadmin)", () => {
  it("title, nav-independent header, the four filters, ACTOR column and a row's cells", async () => {
    list.mockResolvedValue(page([row()]));
    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Audit log" })).not.toBeNull();
    expect(await screen.findByRole("table", { name: "Audit log" })).not.toBeNull();
    for (const label of ["Action kind", "Actor", "From", "To"]) {
      expect(screen.getByLabelText(label)).not.toBeNull();
    }
    for (const header of ["Time", "Actor", "Action", "Target type", "Target", "Notes"]) {
      expect(screen.getByRole("columnheader", { name: header })).not.toBeNull();
    }
    const table = screen.getByRole("table", { name: "Audit log" });
    expect(within(table).getByText("Amara Okafor")).not.toBeNull();
    expect(within(table).getByText("Report actioned")).not.toBeNull();
    expect(within(table).getByText("Report", { selector: "span[role=cell]" })).not.toBeNull();
    expect(within(table).getByText("Content removed")).not.toBeNull();
    expect(within(table).getByText(/2 Nov 2026/)).not.toBeNull();
  });

  it("asks for the newest first page of 20 with no filter, and renders rows in the server's order", async () => {
    list.mockResolvedValue(
      page([row({ id: "r1", notes: "first" }), row({ id: "r2", notes: "second" }), row({ id: "r3", notes: "third" })]),
    );
    renderPage();
    await screen.findByRole("table");
    expect(list).toHaveBeenCalledWith({ limit: 20 });
    const notes = screen.getAllByRole("cell").filter((c) => ["first", "second", "third"].includes(c.textContent ?? ""));
    expect(notes.map((c) => c.textContent)).toEqual(["first", "second", "third"]);
  });

  it("each target links to the existing detail screen; a search row is plain text", async () => {
    list.mockResolvedValue(
      page([
        row({ id: "1", targetType: "report", targetId: "11111111-aaaa" }),
        row({ id: "2", targetType: "admin_user", targetId: "22222222-aaaa" }),
        row({ id: "3", targetType: "contact_enquiry", targetId: "33333333-aaaa" }),
        row({ id: "4", targetType: "post_media", targetId: "44444444-aaaa" }),
        row({ id: "5", targetType: "user", targetId: "55555555-aaaa" }),
        row({ id: "6", targetType: "contest_cycle", targetId: "66666666-aaaa" }),
        row({ id: "8", targetType: "profile_image", targetId: "88888888-aaaa", notes: "avatar" }),
        row({ id: "7", targetType: "search", targetId: "email", action: "admin.search_performed", notes: "kind=email results=2" }),
      ]),
    );
    renderPage();
    await screen.findByRole("table");
    const href = (name: string) => screen.getByRole("link", { name }).getAttribute("href");
    expect(href("Report #11111111")).toBe("/moderation/reports/11111111-aaaa");
    expect(href("Staff #22222222")).toBe("/settings/roles/edit/22222222-aaaa");
    expect(href("Contact enquiry #33333333")).toBe("/moderation/contact-enquiries/33333333-aaaa");
    expect(href("Media #44444444")).toBe("/moderation/media/44444444-aaaa");
    expect(href("User #55555555")).toBe("/users/55555555-aaaa");
    expect(href("Contest #66666666")).toBe("/contest/cycles/66666666-aaaa");
    // B-037: an avatar / cover decision names a person (its target id is their user id); it opens that person's
    // user detail and is labelled as a user, not as a picture.
    expect(href("User #88888888")).toBe("/users/88888888-aaaa");
    expect(screen.getByText("Email search").closest("a")).toBeNull();
    expect(within(screen.getByRole("table")).getByText("Search performed")).not.toBeNull();
  });

  it("profile-picture decisions read plainly: the file, the verb, the person, and the reason when there is one", async () => {
    list.mockResolvedValue(
      page([
        row({ id: "p1", action: "media.approved", targetType: "profile_image", targetId: "aaaa1111-0000", notes: "avatar" }),
        row({ id: "p2", action: "media.rejected", targetType: "profile_image", targetId: "bbbb2222-0000", notes: "cover: Not appropriate." }),
        row({ id: "p3", action: "media.rejected", targetType: "profile_image", targetId: "cccc3333-0000", notes: "avatar: Not a photo: of you" }),
        row({ id: "m1", action: "media.rejected", targetType: "post_media", targetId: "dddd4444-0000", notes: "Off topic" }),
      ]),
    );
    renderPage();
    await screen.findByRole("table");
    const rows = screen.getAllByRole("row").slice(1);
    const cells = (i: number) => within(rows[i]).getAllByRole("cell").map((c) => c.textContent);
    // [time, actor, action, target type, target, notes]
    expect(cells(0).slice(2)).toEqual(["Profile picture approved", "Profile picture", "User #aaaa1111", "—"]);
    expect(cells(1).slice(2)).toEqual(["Cover photo rejected", "Cover photo", "User #bbbb2222", "Reason: Not appropriate."]);
    // Only the first colon splits the kind from the reason.
    expect(cells(2).slice(2)).toEqual(["Profile picture rejected", "Profile picture", "User #cccc3333", "Reason: Not a photo: of you"]);
    // A post media decision keeps its ordinary wording and notes exactly as stored.
    expect(cells(3).slice(2)).toEqual(["Media rejected", "Media", "Media #dddd4444", "Off topic"]);
  });

  it("an appeal recorded on someone's behalf and a username review decision read by label, with notes and links as stored", async () => {
    list.mockResolvedValue(
      page([
        row({ id: "ar", action: "report.appeal_recorded", targetType: "report", targetId: "aaaa1111-0000", notes: "pending" }),
        row({
          id: "ud",
          action: "user.username_review_decided",
          targetType: "user",
          targetId: "bbbb2222-0000",
          notes: "decision=decline; username=adab; reason=Not enough detail.",
        }),
      ]),
    );
    renderPage();
    await screen.findByRole("table");
    const rows = screen.getAllByRole("row").slice(1);
    const cells = (i: number) => within(rows[i]).getAllByRole("cell").map((c) => c.textContent);
    // [time, actor, action, target type, target, notes]
    expect(cells(0).slice(2)).toEqual(["Appeal recorded", "Report", "Report #aaaa1111", "pending"]);
    expect(cells(1).slice(2)).toEqual([
      "Username review decided",
      "User",
      "User #bbbb2222",
      "decision=decline; username=adab; reason=Not enough detail.",
    ]);
    expect(within(rows[0]).getByRole("link").getAttribute("href")).toBe("/moderation/reports/aaaa1111-0000");
    expect(within(rows[1]).getByRole("link").getAttribute("href")).toBe("/users/bbbb2222-0000");
  });

  it("the Action filter offers both new kinds and sends their key", async () => {
    list.mockResolvedValue(page([row()]));
    renderPage();
    await screen.findByRole("table");
    const select = screen.getByLabelText("Action kind") as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => [o.value, o.textContent]);
    expect(options).toContainEqual(["report.appeal_recorded", "Appeal recorded"]);
    expect(options).toContainEqual(["user.username_review_decided", "Username review decided"]);
    fireEvent.change(select, { target: { value: "report.appeal_recorded" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ limit: 20, action: "report.appeal_recorded" }));
  });

  it("an action the app does not know is shown as its key, notes as stored, a missing note as a dash", async () => {
    list.mockResolvedValue(page([row({ action: "something.new", notes: null, targetType: "odd_type" })]));
    renderPage();
    await screen.findByRole("table");
    expect(screen.getByText("something.new")).not.toBeNull();
    expect(screen.getByText("—")).not.toBeNull();
    expect(screen.getAllByText("odd_type").length).toBeGreaterThan(0);
  });

  it("the Actor dropdown lists every admin from the staff list", async () => {
    list.mockResolvedValue(page([row()]));
    renderPage();
    await screen.findByRole("table");
    const select = screen.getByLabelText("Actor") as HTMLSelectElement;
    await waitFor(() => expect(select.options.length).toBe(3));
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(["All admins", "Amara Okafor", "Dayo Adeleke"]);
    expect(staff).toHaveBeenCalledWith({ limit: 50, cursor: undefined });
  });

  it("a failed staff list leaves the Actor dropdown with All admins only and the log unaffected", async () => {
    staff.mockRejectedValue(new Error("nope"));
    list.mockResolvedValue(page([row()]));
    renderPage();
    await screen.findByRole("table");
    const select = screen.getByLabelText("Actor") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(["All admins"]);
  });

  it("Apply filter sends action, actor and the dates and starts again from the first page", async () => {
    list.mockResolvedValue(page([row()]));
    renderPage();
    await screen.findByRole("table");
    await waitFor(() => expect((screen.getByLabelText("Actor") as HTMLSelectElement).options.length).toBe(3));

    fireEvent.change(screen.getByLabelText("Action kind"), { target: { value: "media.rejected" } });
    fireEvent.change(screen.getByLabelText("Actor"), { target: { value: "a2" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-11-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-11-02" } });
    list.mockResolvedValue(page([row({ action: "media.rejected", targetType: "post_media" })]));
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith({
        action: "media.rejected",
        adminId: "a2",
        from: "2026-11-01",
        to: "2026-11-02",
        limit: 20,
      }),
    );
    expect(await screen.findByText("Media rejected", { selector: "span[role=cell]" })).not.toBeNull();
  });

  it("does not offer or send anything until Apply filter is pressed", async () => {
    list.mockResolvedValue(page([row()]));
    renderPage();
    await screen.findByRole("table");
    fireEvent.change(screen.getByLabelText("Action kind"), { target: { value: "media.rejected" } });
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("an end date before the start date is refused on the page, with no request", async () => {
    list.mockResolvedValue(page([row()]));
    renderPage();
    await screen.findByRole("table");
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-11-02" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-11-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
    expect(screen.getByText("The end date can’t be before the start date.")).not.toBeNull();
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("a server 400 on the dates (by code) shows a filter message, not the load error", async () => {
    list.mockResolvedValueOnce(page([row()]));
    renderPage();
    await screen.findByRole("table");
    list.mockRejectedValueOnce(new AdminApiError(400, "x", { code: "admin_action_log_range_invalid" }));
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-11-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
    expect(await screen.findByText("Check the dates and try again.")).not.toBeNull();
    expect(screen.queryByText("Couldn’t load the audit log")).toBeNull();
  });

  it("Load more appends the next page with the cursor and the same filter, then goes away at the end", async () => {
    list.mockResolvedValueOnce(page([row({ id: "a", notes: "n-a" })], "CUR1"));
    renderPage();
    await screen.findByText("n-a");
    list.mockResolvedValueOnce(page([row({ id: "b", notes: "n-b" })], null));
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("n-b")).not.toBeNull();
    expect(screen.getByText("n-a")).not.toBeNull();
    expect(list).toHaveBeenLastCalledWith({ cursor: "CUR1", limit: 20 });
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("a failed Load more keeps the rows and says so", async () => {
    list.mockResolvedValueOnce(page([row({ notes: "kept" })], "CUR1"));
    renderPage();
    await screen.findByText("kept");
    list.mockRejectedValueOnce(new Error("boom"));
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Couldn’t load more activity. Try again.")).not.toBeNull();
    expect(screen.getByText("kept")).not.toBeNull();
  });

  it("every action kind is offered to a child-safety-vetted admin, including the child-safety ones", async () => {
    signInAs("superadmin", { childSafetyVetted: true });
    list.mockResolvedValue(page([row()]));
    renderPage();
    await screen.findByRole("table");
    const options = Array.from((screen.getByLabelText("Action kind") as HTMLSelectElement).options).map((o) => o.value);
    expect(options).toContain("user.dob_viewed");
    expect(options).toContain("user.guardian_notices_withheld");
  });

  it("the child-safety action kinds are not offered to an admin who is not child-safety vetted", async () => {
    signInAs("superadmin", { childSafetyVetted: false });
    list.mockResolvedValue(page([row()]));
    renderPage();
    await screen.findByRole("table");
    const options = Array.from((screen.getByLabelText("Action kind") as HTMLSelectElement).options).map((o) => o.value);
    for (const hidden of [
      "user.dob_viewed",
      "user.dob_corrected",
      "user.guardian_notices_withheld",
      "user.guardian_notices_cleared",
      "user.guardian_notices_reviewed",
      "guardian.incorrect_details_resolved",
    ]) {
      expect(options).not.toContain(hidden);
    }
    expect(options).toContain("report.actioned");
  });
});

describe("My activity (every other admin)", () => {
  beforeEach(() => signInAs("moderator"));

  it("title My activity, no ACTOR column, no Actor filter, and the staff list is never requested", async () => {
    list.mockResolvedValue(page([row()]));
    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "My activity" })).not.toBeNull();
    const table = await screen.findByRole("table", { name: "My activity" });
    expect(screen.queryByRole("columnheader", { name: "Actor" })).toBeNull();
    expect(screen.queryByLabelText("Actor")).toBeNull();
    for (const header of ["Time", "Action", "Target type", "Target", "Notes"]) {
      expect(within(table).getByRole("columnheader", { name: header })).not.toBeNull();
    }
    expect(within(table).queryByText("Amara Okafor")).toBeNull();
    for (const label of ["Action kind", "From", "To"]) expect(screen.getByLabelText(label)).not.toBeNull();
    expect(staff).not.toHaveBeenCalled();
  });

  it("never sends an actor filter", async () => {
    list.mockResolvedValue(page([row()]));
    renderPage();
    await screen.findByRole("table");
    fireEvent.change(screen.getByLabelText("Action kind"), { target: { value: "report.actioned" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ action: "report.actioned", limit: 20 }));
    for (const call of list.mock.calls) expect(call[0]).not.toHaveProperty("adminId");
  });

  it.each([["editor"], ["something_unknown"], [null]])("role %s gets the same smaller layout", async (role) => {
    signInAs(role);
    list.mockResolvedValue(page([row()]));
    renderPage();
    await screen.findByRole("table", { name: "My activity" });
    expect(screen.queryByRole("columnheader", { name: "Actor" })).toBeNull();
    expect(staff).not.toHaveBeenCalled();
  });
});

describe("states", () => {
  it("loading: a skeleton with an accessible label, per variant", async () => {
    list.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole("status", { name: "Loading the audit log" })).not.toBeNull();
    cleanup();
    signInAs("moderator");
    renderPage();
    expect(screen.getByRole("status", { name: "Loading your activity" })).not.toBeNull();
  });

  it("empty: the superadmin line", async () => {
    list.mockResolvedValue(page([]));
    renderPage();
    expect(await screen.findByText("No activity yet")).not.toBeNull();
    expect(screen.getByText("Actions taken by admins will appear here.")).not.toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("empty: the other admins' line, and nothing hints that rows are missing", async () => {
    signInAs("moderator");
    list.mockResolvedValue(page([]));
    const { container } = renderPage();
    expect(await screen.findByText("No activity yet")).not.toBeNull();
    expect(screen.getByText("Your actions will appear here.")).not.toBeNull();
    expect(container.textContent).not.toMatch(/hidden|restricted|not allowed|withheld|missing|cannot see|can.t see|permission/i);
  });

  it("a filter that matches nothing says so without saying anything is hidden", async () => {
    list.mockResolvedValueOnce(page([row()]));
    renderPage();
    await screen.findByRole("table");
    list.mockResolvedValueOnce(page([]));
    fireEvent.change(screen.getByLabelText("Action kind"), { target: { value: "media.rejected" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
    expect(await screen.findByText("No matching activity")).not.toBeNull();
    expect(screen.getByText("Try a different filter.")).not.toBeNull();
  });

  it("load error: the banner per variant, and Retry asks again", async () => {
    list.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderPage();
    expect(await screen.findByText("Couldn’t load the audit log")).not.toBeNull();
    expect(screen.getByText(/Check the connection and try again\./)).not.toBeNull();
    expect(screen.queryByRole("table")).toBeNull();

    list.mockResolvedValueOnce(page([row()]));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("table")).not.toBeNull();
    expect(list).toHaveBeenCalledTimes(2);
    cleanup();

    signInAs("moderator");
    list.mockRejectedValueOnce(new AdminApiError(500, "x"));
    renderPage();
    expect(await screen.findByText("Couldn’t load your activity")).not.toBeNull();
  });

  it("a 403 or 429 is the same plain error, never the server's text", async () => {
    list.mockRejectedValueOnce(new AdminApiError(403, "Some internal message"));
    const { container } = renderPage();
    expect(await screen.findByText("Couldn’t load the audit log")).not.toBeNull();
    expect(container.textContent).not.toMatch(/internal message/);
  });
});

describe("rendered with no session at all", () => {
  it("still renders (as My activity) and asks the server, which decides", async () => {
    signInAs(null);
    list.mockResolvedValue(page([]));
    renderPage();
    expect(await screen.findByText("No activity yet")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "My activity" })).not.toBeNull();
  });
});
