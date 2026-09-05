// Plain DOM assertions, same convention as SportsHubPage.test.tsx / the
// BlogPage test. No endpoint is called (there is no blog backend); the
// article is looked up from local dummy data by the :articleId route
// param.
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import ArticleDetailPage from "./ArticleDetailPage";

afterEach(cleanup);

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/blog/:articleId" element={<ArticleDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ArticleDetailPage", () => {
  it("renders a known article's title, meta and body with no session", () => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    renderAt("/blog/zaha-double-crystal-palace");

    expect(
      screen.getByRole("heading", { name: /Zaha double helps Crystal Palace/i, level: 1 }),
    ).not.toBeNull();
    expect(screen.getByText(/Posted by Admin/i)).not.toBeNull();
    expect(screen.getByText(/Class aptent taciti sociosqu ad litora torquent/i)).not.toBeNull();
  });

  it("renders a not-found state for an unknown article id, with a link back to /blog", () => {
    renderAt("/blog/does-not-exist");

    expect(screen.getByRole("heading", { name: /article not found/i })).not.toBeNull();
    expect(screen.getByRole("link", { name: /back to blog/i }).getAttribute("href")).toBe("/blog");
  });

  it("renders the comment composer disabled with an explanatory note", () => {
    renderAt("/blog/zaha-double-crystal-palace");

    expect(screen.getByText(/comments aren.t available yet/i)).not.toBeNull();
    expect((screen.getByLabelText("Name") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Comment") as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Comment" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("lists 'More Trending News' cards that link to other articles, never itself", () => {
    renderAt("/blog/zaha-double-crystal-palace");

    const section = screen.getByRole("heading", { name: "More Trending News" }).parentElement as HTMLElement;
    const links = section.querySelectorAll("a");
    expect(links.length).toBe(3);
    links.forEach((a) => {
      expect(a.getAttribute("href")).not.toBe("/blog/zaha-double-crystal-palace");
      expect(a.getAttribute("href")).toMatch(/^\/blog\//);
    });
  });
});
