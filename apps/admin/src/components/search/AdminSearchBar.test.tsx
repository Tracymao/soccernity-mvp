// The admin search bar (B-114, Decision Log #463): a real form that opens /search?q=, in the states the Figma
// component draws (Idle, Focused, With text, Submitting). The old disabled, "not available yet" input is gone.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import AdminSearchBar, { SEARCH_ENTER_HINT, SEARCH_HELPER } from "./AdminSearchBar";

afterEach(cleanup);

function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

function renderBar(props: Parameters<typeof AdminSearchBar>[0] = {}, path = "/users") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<AdminSearchBar {...props} />} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

function input(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "Search Soccernity" }) as HTMLInputElement;
}

describe("AdminSearchBar", () => {
  it("is an enabled search form, with nothing saying it is not available", () => {
    const { container } = renderBar();
    expect(screen.getByRole("search")).not.toBeNull();
    expect(input().disabled).toBe(false);
    expect(input().placeholder).toBe("Search Soccernity");
    expect(container.textContent).not.toMatch(/not available/i);
    expect(container.querySelector("[title]")).toBeNull();
  });

  it("shows the helper text, and the Enter hint only once there is unsubmitted text", () => {
    renderBar();
    expect(screen.getByText(SEARCH_HELPER)).not.toBeNull();
    expect(screen.queryByText(new RegExp(SEARCH_ENTER_HINT))).toBeNull();

    fireEvent.change(input(), { target: { value: "ada@example.com" } });
    expect(screen.getByText(`${SEARCH_HELPER} ${SEARCH_ENTER_HINT}`)).not.toBeNull();
  });

  it("has no clear control while empty, shows one once there is text, and clearing empties the field", () => {
    renderBar();
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();

    fireEvent.change(input(), { target: { value: "nelson" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(input().value).toBe("");
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
  });

  it("submitting opens /search with the trimmed query in the URL", () => {
    renderBar();
    fireEvent.change(input(), { target: { value: "  nelson  " } });
    fireEvent.submit(screen.getByRole("search"));
    expect(screen.getByTestId("where").textContent).toBe("/search?q=nelson");
  });

  it("encodes characters that would break the URL", () => {
    renderBar();
    fireEvent.change(input(), { target: { value: "a&b=c d@example.com" } });
    fireEvent.submit(screen.getByRole("search"));
    const url = new URL(`http://x${screen.getByTestId("where").textContent}`);
    expect(url.searchParams.get("q")).toBe("a&b=c d@example.com");
  });

  it("does nothing for an empty or whitespace-only query", () => {
    renderBar();
    fireEvent.submit(screen.getByRole("search"));
    fireEvent.change(input(), { target: { value: "   " } });
    fireEvent.submit(screen.getByRole("search"));
    expect(screen.getByTestId("where").textContent).toBe("/users");
  });

  it("starts from the query already in the URL and follows it when it changes", () => {
    const { rerender } = render(
      <MemoryRouter>
        <AdminSearchBar initialQuery="first" />
      </MemoryRouter>,
    );
    expect(input().value).toBe("first");
    // No unsubmitted text, so no Enter hint.
    expect(screen.queryByText(new RegExp(SEARCH_ENTER_HINT))).toBeNull();

    rerender(
      <MemoryRouter>
        <AdminSearchBar initialQuery="second" />
      </MemoryRouter>,
    );
    expect(input().value).toBe("second");
  });

  it("hands the trimmed query to onSubmit instead of navigating when one is given", () => {
    const onSubmit = vi.fn();
    renderBar({ onSubmit });
    fireEvent.change(input(), { target: { value: " abc " } });
    fireEvent.submit(screen.getByRole("search"));
    expect(onSubmit).toHaveBeenCalledWith("abc");
    expect(screen.getByTestId("where").textContent).toBe("/users");
  });

  it("shows Searching… and no clear control while submitting", () => {
    renderBar({ initialQuery: "nelson", submitting: true });
    expect(screen.getByText("Searching…")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
  });
});
