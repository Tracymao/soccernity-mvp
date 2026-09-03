// AuthChrome + AuthTopBar (Decision Log #172): the core auth routes get a
// logo-only Top Bar, NOT the full site Header. Plain DOM assertions only,
// following AgeGateStep.test.tsx's established pattern.
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import AuthChrome from "./AuthChrome";

afterEach(cleanup);

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        element: <AuthChrome />,
        children: [
          { path: "login", element: <div data-testid="stub-login">login screen</div> },
          { path: "signup", element: <div data-testid="stub-signup">signup screen</div> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
}

describe("AuthChrome", () => {
  it("renders the logo-only Top Bar (logo links home, no content nav, no auth cluster)", () => {
    renderAt("/login");

    const home = screen.getByRole("link", { name: "Soccernity home" });
    expect(home.getAttribute("href")).toBe("/");
    expect(screen.getByText("Soccernity")).toBeTruthy();

    // The full site Header's primary nav / Login button must not be here.
    expect(screen.queryByRole("navigation", { name: "Primary" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Login" })).toBeNull();
  });

  it("renders the routed auth screen below the Top Bar", () => {
    renderAt("/signup");
    expect(screen.getByTestId("stub-signup")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Soccernity home" })).toBeTruthy();
  });
});
