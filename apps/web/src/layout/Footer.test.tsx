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

  it("renders the canonical footer content: wordmark, 6 socials, 4 legal links, copyright", () => {
    renderFooter();

    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText("Soccernity")).toBeTruthy();

    for (const label of ["facebook", "instagram", "twitter", "Tik Tok", "YouTube", "LinkedIn"]) {
      expect(within(footer).getByText(label)).toBeTruthy();
    }
    for (const link of ["Terms of Service", "Privacy Policy", "Privacy Settings", "Contact Us"]) {
      expect(within(footer).getByText(link)).toBeTruthy();
    }
    expect(within(footer).getByText(/Copyright . 2026 Soccernity\. All rights reserved/i)).toBeTruthy();
  });

  it("renders the legal links as non-navigating spans (no /terms, /privacy, /contact routes exist yet)", () => {
    renderFooter();
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).queryAllByRole("link")).toHaveLength(0);
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
