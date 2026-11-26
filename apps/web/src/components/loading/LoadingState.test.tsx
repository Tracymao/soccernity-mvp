// Page loader (Decision Log #581). Plain DOM assertions, no jest-dom.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import LoadingState from "./LoadingState";
import { SkeletonList } from "./Skeleton";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("LoadingState", () => {
  it("is a status carrying the label as visually hidden text, with a decorative spinner", () => {
    render(<LoadingState label="Loading standings…" />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Loading standings…");
    expect(screen.getByText("Loading standings…").className).toBe("sn-visually-hidden");
    expect(status.querySelector(".sn-spinner")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("defaults to the label Loading and the section variant", () => {
    render(<LoadingState />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Loading");
    expect(status.className).toBe("sn-loading sn-loading--section");
  });

  it.each(["page", "section", "inline"] as const)("applies the %s class and keeps a caller's class", (variant) => {
    render(<LoadingState variant={variant} className="extra" />);
    const status = screen.getByRole("status");
    expect(status.className).toBe(`sn-loading sn-loading--${variant} extra`);
    expect(status.tagName).toBe(variant === "inline" ? "SPAN" : "DIV");
  });

  it("starts no JavaScript timer (the delay is CSS)", () => {
    const timeout = vi.spyOn(globalThis, "setTimeout");
    const interval = vi.spyOn(globalThis, "setInterval");
    render(<LoadingState />);
    expect(timeout).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
  });
});

describe("SkeletonList", () => {
  it("keeps the wording for screen readers and hides the shapes", () => {
    render(<SkeletonList label="Loading the leaderboard…" shape="rows" count={2} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Loading the leaderboard…");
    const rows = status.querySelectorAll(".sn-skeleton-row");
    expect(rows).toHaveLength(2);
    rows.forEach((row) => expect(row.getAttribute("aria-hidden")).toBe("true"));
  });
});
