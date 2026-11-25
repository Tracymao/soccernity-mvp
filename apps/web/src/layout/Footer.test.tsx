// Shared Footer + FooterLayout (Decision Log #213). Plain DOM assertions,
// following AuthChrome.test.tsx's pattern -- a local memory router with
// stub pages, not the real src/app/router.tsx (which would pull in every
// page's API calls).
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router";
import Footer from "./Footer";
import FooterLayout from "./FooterLayout";

afterEach(cleanup);

describe("Footer", () => {
  function renderFooter() {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );
  }

  it("renders the canonical footer content: wordmark, 4 socials, 3 legal links, copyright", () => {
    renderFooter();

    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText("Soccernity")).toBeTruthy();

    for (const label of ["facebook", "twitter", "Tik Tok", "YouTube"]) {
      expect(within(footer).getByText(label)).toBeTruthy();
    }
    // "Privacy Settings" removed to match Decision Log #222 (sprint-2/privacy-settings-to-code).
    for (const link of ["Terms of Service", "Privacy Policy", "Contact Us"]) {
      expect(within(footer).getByText(link)).toBeTruthy();
    }
    expect(within(footer).getByText(/Copyright . 2026 Soccernity\. All rights reserved/i)).toBeTruthy();
  });

  it("renders the three legal links as real links to /terms, /privacy and /contact (B-047)", () => {
    renderFooter();
    const footer = screen.getByRole("contentinfo");
    for (const [label, href] of [
      ["Terms of Service", "/terms"],
      ["Privacy Policy", "/privacy"],
      ["Contact Us", "/contact"],
    ]) {
      expect(within(footer).getByRole("link", { name: label }).getAttribute("href")).toBe(href);
    }
    // Three legal links, "Report a concern" and the four social links.
    expect(within(footer).getAllByRole("link")).toHaveLength(8);
  });

  it("links the four social icons to the founder's accounts in a new tab; Instagram and LinkedIn are not shown (Decision Log #567)", () => {
    renderFooter();
    const footer = screen.getByRole("contentinfo");
    const expected: Record<string, string> = {
      facebook: "https://www.facebook.com/soccernity",
      twitter: "https://x.com/soccernity",
      "Tik Tok": "https://www.tiktok.com/@soccernity",
      YouTube: "https://www.youtube.com/@soccernity",
    };
    for (const [label, href] of Object.entries(expected)) {
      const link = within(footer).getByRole("link", { name: `${label} (opens in a new tab)` });
      expect(link.getAttribute("href")).toBe(href);
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
      expect(link.getAttribute("rel")).toContain("noreferrer");
    }
    expect(within(footer).queryByText(/instagram/i)).toBeNull();
    expect(within(footer).queryByText("LinkedIn")).toBeNull();
  });

  it("links 'Report a concern' to the real /report page", () => {
    renderFooter();
    const footer = screen.getByRole("contentinfo");
    const link = within(footer).getByRole("link", { name: "Report a concern" });
    expect(link.getAttribute("href")).toBe("/report");
  });
});

describe("FooterLayout", () => {
  function renderAt(path: string) {
    const router = createMemoryRouter(
      [
        {
          element: <FooterLayout />,
          children: [
            { index: true, element: <div data-testid="stub-home">home</div> },
            { path: "with-footer", element: <div data-testid="stub-page">page</div> },
          ],
        },
        { path: "no-footer", element: <div data-testid="stub-bare">bare</div> },
      ],
      { initialEntries: [path] },
    );
    render(<RouterProvider router={router} />);
  }

  it("renders the routed page plus exactly one footer", () => {
    renderAt("/with-footer");
    expect(screen.getByTestId("stub-page")).toBeTruthy();
    expect(screen.getAllByRole("contentinfo")).toHaveLength(1);
  });

  it("renders no footer for a route outside the layout", () => {
    renderAt("/no-footer");
    expect(screen.getByTestId("stub-bare")).toBeTruthy();
    expect(screen.queryByRole("contentinfo")).toBeNull();
  });
});
