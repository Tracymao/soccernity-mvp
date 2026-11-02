// Admin search results page (B-114, Decision Log #463): every state the Figma frames draw, the grouping and
// the links, role-restricted groups simply absent, and that nothing the server does not return is drawn.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { AdminApiError } from "../../api/adminClient";

vi.mock("../../api/adminSearch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/adminSearch")>();
  return { ...actual, adminSearch: vi.fn() };
});

import { adminSearch, type AdminSearchResult } from "../../api/adminSearch";
import SearchPage from "./SearchPage";
import AdminPageHeader from "../../layout/AdminPageHeader";

const search = vi.mocked(adminSearch);

beforeEach(() => search.mockReset());
afterEach(cleanup);

function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/search" element={<SearchPage />} />
        <Route path="*" element={<p>elsewhere</p>} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

const USER = {
  id: "11111111-aaaa-4aaa-8aaa-111111111111",
  displayName: "Nelson Iheagwam",
  username: "nelson_iheagwam",
  email: "nelson@example.com",
  accountStatus: "active",
  createdAt: "2026-09-14T10:00:00.000Z",
};
const SUSPENDED_USER = { ...USER, id: "22222222-aaaa-4aaa-8aaa-222222222222", username: null, displayName: "Nelson K", accountStatus: "suspended" };
const REPORT = {
  id: "33333333-bbbb-4bbb-8bbb-333333333333",
  targetType: "post",
  targetId: "p1",
  status: "open",
  severity: "high",
  concernsMinor: true,
  createdAt: "2026-10-01T10:00:00.000Z",
  source: null,
};
const ENQUIRY = {
  id: "44444444-cccc-4ccc-8ccc-444444444444",
  name: "Tunde Bello",
  email: "tunde@example.com",
  category: "data",
  subject: "Wrong fixture time",
  status: "new",
  createdAt: "2026-10-26T10:00:00.000Z",
  lastMessageAt: "2026-10-26T10:00:00.000Z",
  handledAt: null,
  handledByAdminId: null,
  submitter: "guest" as const,
  hasEscalation: true,
};
const ARTICLE = {
  id: "55555555-dddd-4ddd-8ddd-555555555555",
  title: "Zaha double helps Crystal Palace",
  status: "published",
  category: { id: "c1", name: "Premier League" },
  publishedAt: "2022-08-08T10:00:00.000Z",
  createdAt: "2022-08-08T09:00:00.000Z",
};
const STAFF = {
  id: "66666666-eeee-4eee-8eee-666666666666",
  email: "amara@soccernity.com",
  fullName: "Amara Okafor",
  role: "moderator",
  accountStatus: "active",
};
const MEDIA = {
  id: "77777777-ffff-4fff-8fff-777777777777",
  kind: "video",
  status: "pending",
  reportCount: 2,
  createdAt: "2026-10-30T10:00:00.000Z",
};

const ALL_GROUPS: AdminSearchResult = {
  groups: {
    users: { items: [USER, SUSPENDED_USER], truncated: false },
    reports: { items: [REPORT], truncated: false },
    contactEnquiries: { items: [ENQUIRY], truncated: false },
    articles: { items: [ARTICLE], truncated: false },
    staff: { items: [STAFF], truncated: false },
    media: { items: [MEDIA], truncated: false },
  },
};

describe("SearchPage: idle", () => {
  it("with no query: title, bar, helper, the intro, and no request", () => {
    renderAt("/search");
    expect(screen.getByRole("heading", { name: "Search" })).not.toBeNull();
    expect(screen.getByRole("textbox", { name: "Search Soccernity" })).not.toBeNull();
    expect(screen.getByText("Email lookups need the full address, for example name@example.com.")).not.toBeNull();
    expect(screen.getByText("What you can search")).not.toBeNull();
    expect(
      screen.getByText("Type in the bar above and press Enter. Each result opens the page you already use for it."),
    ).not.toBeNull();
    expect(search).not.toHaveBeenCalled();
  });

  it("does not list kinds of result itself (which ones exist is the server's answer, by role)", () => {
    renderAt("/search");
    for (const kind of ["Users", "Reports", "Contact enquiries", "Articles", "Staff", "Media review"]) {
      expect(screen.queryByText(kind)).toBeNull();
    }
  });
});

describe("SearchPage: too short", () => {
  it("shows the Keep typing banner and sends nothing", () => {
    renderAt("/search?q=ab");
    expect(screen.getByText("Keep typing")).not.toBeNull();
    expect(screen.getByText("Type at least 3 characters to search. Nothing was searched.")).not.toBeNull();
    expect(search).not.toHaveBeenCalled();
  });

  it("counts the trimmed query", () => {
    renderAt("/search?q=%20%20a%20%20");
    expect(screen.getByText("Keep typing")).not.toBeNull();
    expect(search).not.toHaveBeenCalled();
  });

  it("also shows it when the server says the query was too short", async () => {
    search.mockRejectedValueOnce(new AdminApiError(400, "Too short", { code: "admin_search_query_too_short" }));
    renderAt("/search?q=abc");
    expect(await screen.findByText("Keep typing")).not.toBeNull();
  });
});

describe("SearchPage: server refusals of the query", () => {
  it("too long", async () => {
    search.mockRejectedValueOnce(new AdminApiError(400, "x", { code: "admin_search_query_too_long" }));
    renderAt("/search?q=abc");
    expect(await screen.findByText("That search is too long")).not.toBeNull();
  });

  it("invalid characters", async () => {
    search.mockRejectedValueOnce(new AdminApiError(400, "x", { code: "admin_search_query_invalid" }));
    renderAt("/search?q=abc");
    expect(await screen.findByText("That search can’t be used")).not.toBeNull();
  });

  it("a 400 with no known code is the plain error state, never the server's text", async () => {
    search.mockRejectedValueOnce(new AdminApiError(400, "Some internal message", { code: "something_else" }));
    renderAt("/search?q=abc");
    expect(await screen.findByText("Couldn’t run the search")).not.toBeNull();
    expect(screen.queryByText(/internal message/)).toBeNull();
  });
});

describe("SearchPage: loading", () => {
  it("sends the trimmed query, shows Searching for … with the bar in its submitting state", async () => {
    let resolve!: (value: AdminSearchResult) => void;
    search.mockReturnValue(new Promise((r) => (resolve = r)));
    renderAt("/search?q=%20chioma.eze%40example.com%20");

    expect(screen.getByText("Searching for “chioma.eze@example.com”…")).not.toBeNull();
    expect(screen.getByText("Searching…")).not.toBeNull();
    expect(search).toHaveBeenCalledWith("chioma.eze@example.com");

    resolve({ groups: { users: { items: [USER], truncated: false } } });
    await screen.findByText("Results for “chioma.eze@example.com”");
    expect(screen.queryByText("Searching…")).toBeNull();
  });
});

describe("SearchPage: results", () => {
  it("draws every group the server returned, in the server's order, with the summary", async () => {
    search.mockResolvedValue(ALL_GROUPS);
    renderAt("/search?q=nelson");

    expect(await screen.findByText("Results for “nelson”")).not.toBeNull();
    expect(screen.getByText("7 results in 6 groups")).not.toBeNull();

    const order = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(order).toEqual(["Users", "Reports", "Contact enquiries", "Articles", "Staff", "Media review"]);
  });

  it("users: name and @username, date, status pills (suspended carries the alert dot)", async () => {
    search.mockResolvedValue({ groups: { users: { items: [USER, SUSPENDED_USER], truncated: false } } });
    renderAt("/search?q=nelson");

    const table = await screen.findByRole("table", { name: "Users" });
    expect(within(table).getByText("Nelson Iheagwam (@nelson_iheagwam)")).not.toBeNull();
    expect(within(table).getByText("Nelson K")).not.toBeNull();
    expect(within(table).getAllByText("14 Sep 2026").length).toBe(2);
    expect(within(table).getByText("Active")).not.toBeNull();
    expect(within(table).getByText("Suspended")).not.toBeNull();
    expect(within(table).getByText("Suspended").querySelector(".se-pill__dot")).not.toBeNull();
    expect(screen.getByText("2 results in 1 group")).not.toBeNull();
  });

  it("each row links to the existing detail page", async () => {
    search.mockResolvedValue(ALL_GROUPS);
    renderAt("/search?q=nelson");
    await screen.findByText("Results for “nelson”");

    const hrefOf = (name: string) => screen.getByRole("link", { name }).getAttribute("href");
    expect(hrefOf("Open Nelson Iheagwam")).toBe(`/users/${USER.id}`);
    expect(hrefOf("Open Nelson K")).toBe(`/users/${SUSPENDED_USER.id}`);
    expect(hrefOf(`Review report ${REPORT.id.slice(0, 8)}`)).toBe(`/moderation/reports/${REPORT.id}`);
    expect(hrefOf("Open Wrong fixture time")).toBe(`/moderation/contact-enquiries/${ENQUIRY.id}`);
    expect(hrefOf("Open Zaha double helps Crystal Palace")).toBe("/articles");
    expect(hrefOf("Open Amara Okafor")).toBe(`/settings/roles/edit/${STAFF.id}`);
    expect(hrefOf(`Review video ${MEDIA.id.slice(0, 8)}`)).toBe(`/moderation/media/${MEDIA.id}`);
  });

  it("clicking a result moves to that page", async () => {
    search.mockResolvedValue({ groups: { users: { items: [USER], truncated: false } } });
    renderAt("/search?q=nelson");
    fireEvent.click(await screen.findByRole("link", { name: "Open Nelson Iheagwam" }));
    expect(screen.getByTestId("where").textContent).toBe(`/users/${USER.id}`);
  });

  it("reports: short id, type, status, severity and the minor flag; contact-enquiry reports are labelled so", async () => {
    search.mockResolvedValue({
      groups: {
        reports: {
          items: [REPORT, { ...REPORT, id: "88888888-bbbb-4bbb-8bbb-888888888888", concernsMinor: false, source: "contact_enquiry" }],
          truncated: false,
        },
      },
    });
    renderAt("/search?q=33333333");
    const table = await screen.findByRole("table", { name: "Reports" });
    expect(within(table).getByText("#33333333")).not.toBeNull();
    expect(within(table).getByText("Post")).not.toBeNull();
    expect(within(table).getByText("Contact enquiry")).not.toBeNull();
    expect(within(table).getAllByText("Open").length).toBe(2);
    expect(within(table).getAllByText("High").length).toBe(2);
    expect(within(table).getByText("Concerns a minor")).not.toBeNull();
    expect(within(table).getAllByText("Concerns a minor").length).toBe(1);
  });

  it("contact enquiries: received, name, category label, subject, status and the escalated flag", async () => {
    search.mockResolvedValue({ groups: { contactEnquiries: { items: [ENQUIRY], truncated: false } } });
    renderAt("/search?q=tunde%40example.com");
    const table = await screen.findByRole("table", { name: "Contact enquiries" });
    expect(within(table).getByText("26 Oct 2026")).not.toBeNull();
    expect(within(table).getByText("Tunde Bello")).not.toBeNull();
    expect(within(table).getByText("Data")).not.toBeNull();
    expect(within(table).getByText("Wrong fixture time")).not.toBeNull();
    expect(within(table).getByText("New")).not.toBeNull();
    expect(within(table).getByText("Escalated")).not.toBeNull();
  });

  it("articles, staff and media columns", async () => {
    search.mockResolvedValue(ALL_GROUPS);
    renderAt("/search?q=nelson");
    const articles = await screen.findByRole("table", { name: "Articles" });
    expect(within(articles).getByText("Premier League")).not.toBeNull();
    expect(within(articles).getByText("Published")).not.toBeNull();
    const staff = screen.getByRole("table", { name: "Staff" });
    expect(within(staff).getByText("amara@soccernity.com")).not.toBeNull();
    expect(within(staff).getByText("Moderator")).not.toBeNull();
    const media = screen.getByRole("table", { name: "Media review" });
    expect(within(media).getByText("Video")).not.toBeNull();
    expect(within(media).getByText("Pending")).not.toBeNull();
    expect(within(media).getByText("2")).not.toBeNull();
  });

  it("a singular result", async () => {
    search.mockResolvedValue({ groups: { staff: { items: [STAFF], truncated: false } } });
    renderAt("/search?q=amara");
    expect(await screen.findByText("1 result in 1 group")).not.toBeNull();
  });
});

describe("SearchPage: role-restricted and empty groups", () => {
  it("a group the server left out is not drawn and nothing says it was not allowed", async () => {
    // What an editor gets: only the groups their role may open are keys of `groups`.
    search.mockResolvedValue({ groups: { articles: { items: [ARTICLE], truncated: false } } });
    const { container } = renderAt("/search?q=zaha");
    await screen.findByRole("table", { name: "Articles" });
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Articles"]);
    expect(container.textContent).not.toMatch(/not allowed|permission|restricted|cannot access|no access/i);
  });

  it("a group present but empty is not drawn either", async () => {
    search.mockResolvedValue({
      groups: {
        users: { items: [USER], truncated: false },
        reports: { items: [], truncated: false },
        media: { items: [], truncated: false },
      },
    });
    renderAt("/search?q=nelson");
    await screen.findByRole("table", { name: "Users" });
    expect(screen.queryByRole("table", { name: "Reports" })).toBeNull();
    expect(screen.queryByText("Media review")).toBeNull();
    expect(screen.getByText("1 result in 1 group")).not.toBeNull();
  });
});

describe("SearchPage: a group at its cap", () => {
  it("shows N+, the cap note, the summary with a plus and the not-shown row", async () => {
    const items = Array.from({ length: 3 }, (_, i) => ({ ...USER, id: `id-${i}`, displayName: `Ade ${i}`, username: `ade_${i}` }));
    search.mockResolvedValue({ groups: { users: { items, truncated: true } } });
    renderAt("/search?q=ade");

    expect(await screen.findByText("3+")).not.toBeNull();
    expect(screen.getByText("Showing the first 3. Refine your search to narrow it down.")).not.toBeNull();
    expect(screen.getByText("3+ results in 1 group")).not.toBeNull();
    expect(
      screen.getByText("More matches are not shown. Use a longer start to the username, the full email address or the user ID."),
    ).not.toBeNull();
  });

  it("a capped group that is not Users gets the general wording", async () => {
    search.mockResolvedValue({ groups: { staff: { items: [STAFF], truncated: true } } });
    renderAt("/search?q=ama");
    expect(await screen.findByText("More matches are not shown. Use a longer or more exact search.")).not.toBeNull();
  });
});

describe("SearchPage: no results", () => {
  it("shows the summary, 0 results and the No results banner", async () => {
    search.mockResolvedValue({ groups: { users: { items: [], truncated: false } } });
    renderAt("/search?q=zzzz%40example.com");
    expect(await screen.findByText("Results for “zzzz@example.com”")).not.toBeNull();
    expect(screen.getByText("0 results")).not.toBeNull();
    expect(screen.getByText("No results")).not.toBeNull();
    expect(
      screen.getByText("Nothing matched. Check the spelling, or try the full email address, a user ID or a report ID."),
    ).not.toBeNull();
  });

  it("an empty groups object is also no results", async () => {
    search.mockResolvedValue({ groups: {} });
    renderAt("/search?q=abc");
    expect(await screen.findByText("No results")).not.toBeNull();
  });
});

describe("SearchPage: load error", () => {
  it("shows the error banner and Try again, which asks again", async () => {
    search.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderAt("/search?q=abc");

    expect(await screen.findByText("Couldn’t run the search")).not.toBeNull();
    expect(screen.getByText("Check the connection and try again.")).not.toBeNull();

    search.mockResolvedValueOnce({ groups: { users: { items: [USER], truncated: false } } });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("table", { name: "Users" })).not.toBeNull();
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("a 429 or 403 is the same plain error state", async () => {
    search.mockRejectedValueOnce(new AdminApiError(429, "Too many requests"));
    renderAt("/search?q=abc");
    expect(await screen.findByText("Couldn’t run the search")).not.toBeNull();
    expect(screen.queryByText(/Too many requests/)).toBeNull();
  });
});

describe("SearchPage: the query lives in the URL", () => {
  it("the bar is filled from ?q=", async () => {
    search.mockResolvedValue({ groups: {} });
    renderAt("/search?q=nelson");
    await screen.findByText("No results");
    expect((screen.getByRole("textbox", { name: "Search Soccernity" }) as HTMLInputElement).value).toBe("nelson");
  });

  it("submitting a new query changes the URL and searches again", async () => {
    search.mockResolvedValue({ groups: {} });
    renderAt("/search?q=nelson");
    await screen.findByText("No results");

    fireEvent.change(screen.getByRole("textbox", { name: "Search Soccernity" }), { target: { value: "amara" } });
    fireEvent.submit(screen.getByRole("search"));

    await waitFor(() => expect(search).toHaveBeenLastCalledWith("amara"));
    expect(screen.getByTestId("where").textContent).toBe("/search?q=amara");
  });

  it("submitting the same query again runs it again", async () => {
    search.mockResolvedValue({ groups: {} });
    renderAt("/search?q=nelson");
    await screen.findByText("No results");

    fireEvent.submit(screen.getByRole("search"));
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2));
  });

  it("a slower earlier answer never replaces a later one", async () => {
    let first!: (value: AdminSearchResult) => void;
    search.mockReturnValueOnce(new Promise((r) => (first = r)));
    search.mockResolvedValueOnce({ groups: { staff: { items: [STAFF], truncated: false } } });
    renderAt("/search?q=nelson");

    fireEvent.change(screen.getByRole("textbox", { name: "Search Soccernity" }), { target: { value: "amara" } });
    fireEvent.submit(screen.getByRole("search"));
    await screen.findByRole("table", { name: "Staff" });

    first({ groups: { users: { items: [USER], truncated: false } } });
    await Promise.resolve();
    expect(screen.queryByRole("table", { name: "Users" })).toBeNull();
    expect(screen.getByRole("table", { name: "Staff" })).not.toBeNull();
  });
});

describe("SearchPage: only what the server returns", () => {
  it("draws no MATCHED ON, REASON, SOURCE, UPLOADER or TWO-FACTOR column and no message or reason text", async () => {
    search.mockResolvedValue(ALL_GROUPS);
    const { container } = renderAt("/search?q=nelson");
    await screen.findByText("Results for “nelson”");
    for (const header of ["matched on", "reason", "source", "uploader", "two-factor", "message"]) {
      expect(screen.queryByRole("columnheader", { name: new RegExp(`^${header}$`, "i") })).toBeNull();
    }
    expect(container.textContent).not.toMatch(/matched on/i);
  });
});

describe("AdminPageHeader", () => {
  it("shows the working bar unless a screen hides it", () => {
    const { rerender } = render(
      <MemoryRouter>
        <AdminPageHeader title="Users" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("search")).not.toBeNull();
    rerender(
      <MemoryRouter>
        <AdminPageHeader title="Users" hideSearch />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("search")).toBeNull();
  });
});
