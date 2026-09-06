// Router-level footer placement (Decision Log #227/#228). Mounts the REAL
// route tree from ./router.tsx via createMemoryRouter -- no browser
// history, no mocks: every page reachable here renders statically with an
// empty session (Home redirects only WITH a token; Leaderboard / Contest
// render a "log in" prompt and call nothing; Sports Hub / Blog / 404 use
// dummy data).
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router";
import { routes } from "./router";
import FooterLayout from "../layout/FooterLayout";

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

async function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  // let the router resolve the match
  await waitFor(() => expect(document.querySelector("main")).not.toBeNull());
  return router;
}

/** Every leaf route path that FooterLayout is the parent element of. */
function footerLayoutRoutePaths(tree: RouteObject[]): string[] {
  const out: string[] = [];
  const walk = (nodes: RouteObject[], underFooter: boolean) => {
    for (const n of nodes) {
      const isFooterLayout =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (n.element as any)?.type === FooterLayout;
      const childUnder = underFooter || isFooterLayout;
      if (n.children) walk(n.children, childUnder);
      else if (childUnder) out.push(n.path ?? (n.index ? "(index)" : "(pathless)"));
    }
  };
  walk(tree, false);
  return out;
}

describe("router — FooterLayout membership (Decision Log #227/#228)", () => {
  it("FooterLayout wraps exactly Home, Sports Hub, Blog, Article Detail, and 404", () => {
    expect(footerLayoutRoutePaths(routes).sort()).toEqual(
      ["(index)", "*", "blog", "blog/:articleId", "sports-hub"].sort(),
    );
  });

  it("does NOT wrap Leaderboard or Contest", () => {
    const paths = footerLayoutRoutePaths(routes);
    expect(paths).not.toContain("leaderboard");
    expect(paths).not.toContain("contest");
  });
});

describe("router — rendered footer presence", () => {
  it("/leaderboard renders no site footer", async () => {
    await renderAt("/leaderboard");
    expect(screen.getByText(/Log in to see the Leaderboard/i)).not.toBeNull();
    expect(screen.queryByRole("contentinfo")).toBeNull();
  });

  it("/contest renders no site footer", async () => {
    await renderAt("/contest");
    expect(screen.getByText(/Log in to see this month/i)).not.toBeNull();
    expect(screen.queryByRole("contentinfo")).toBeNull();
  });

  it("a genuinely unmatched path 404s AND renders the site footer", async () => {
    await renderAt("/no-such-page-xyz");
    expect(screen.getByRole("heading", { name: /page not found/i })).not.toBeNull();
    expect(screen.getByRole("contentinfo")).not.toBeNull();
  });

  it("/ (marketing home) still renders the site footer", async () => {
    await renderAt("/");
    expect(screen.getByRole("contentinfo")).not.toBeNull();
  });

  it("/sports-hub still renders the site footer", async () => {
    await renderAt("/sports-hub");
    expect(screen.getByRole("contentinfo")).not.toBeNull();
  });

  it("every other route still resolves — /community renders its page, no footer", async () => {
    await renderAt("/community");
    // CommunityPage with no session -> its own "log in" prompt, still no footer.
    expect(screen.queryByRole("contentinfo")).toBeNull();
    expect(document.querySelector("main")).not.toBeNull();
  });
});
