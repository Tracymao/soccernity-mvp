// Plain DOM assertions, same convention as SportsHubPage.test.tsx. This
// page calls no endpoint (there is no blog backend) and renders
// identically with or without a session, so nothing is mocked.
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import BlogPage from "./BlogPage";

afterEach(cleanup);

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/blog"]}>
      <BlogPage />
    </MemoryRouter>,
  );
}

describe("BlogPage", () => {
  it("renders with no session at all -- no login gate on this page", () => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    renderPage();
    expect(screen.getByText(/Feel The Passion/i)).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Trending Topics" })).not.toBeNull();
  });

  it("links each article card to its detail route", () => {
    renderPage();
    const link = screen.getAllByRole("link", {
      name: /Zaha double helps Crystal Palace/i,
    })[0];
    expect(link.getAttribute("href")).toBe("/blog/zaha-double-crystal-palace");
  });

  it("filters to a single category section when a category tab is selected", () => {
    renderPage();
    // "all" shows the Trending Topics section plus a per-league section.
    expect(screen.getByRole("heading", { name: "Trending Topics" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "La Liga" })).not.toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "NPFL" }));

    expect(screen.queryByRole("heading", { name: "Trending Topics" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "La Liga" })).toBeNull();
    expect(screen.getByRole("heading", { name: "NPFL" })).not.toBeNull();
  });

  it("filters by the search box and shows an empty state when nothing matches", () => {
    renderPage();

    fireEvent.change(screen.getByLabelText(/search topics/i), { target: { value: "Girona" } });
    const results = screen.getByRole("heading", { name: /Results for/i }).parentElement as HTMLElement;
    expect(within(results).getByText(/Girona are the surprise package/i)).not.toBeNull();
    expect(within(results).queryByText(/Kane joins 250 club/i)).toBeNull();

    fireEvent.change(screen.getByLabelText(/search topics/i), { target: { value: "zzzznomatch" } });
    expect(screen.getByText(/no articles match that search/i)).not.toBeNull();
  });

  it("renders the illustrative-data disclosure note", () => {
    renderPage();
    expect(screen.getByText(/the blog does not have a content backend yet/i)).not.toBeNull();
  });
});
