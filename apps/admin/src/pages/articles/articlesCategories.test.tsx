import { describe, it, expect, afterEach } from "vitest";
import type { ReactElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ArticlesPage from "./ArticlesPage";
import CreateArticlePage from "./CreateArticlePage";
import CategoriesPage from "../categories/CategoriesPage";
import AddCategoryPage from "../categories/AddCategoryPage";

afterEach(cleanup);

const renderIn = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("Articles + Categories stub screens", () => {
  it("Articles: sample table + a working link to Create Article", () => {
    renderIn(<ArticlesPage />);
    expect(screen.getByRole("note").textContent).toMatch(/not built/i);
    expect(screen.getByText("Sample — not real data")).not.toBeNull();
    const link = screen.getByRole("link", { name: "Create Article" });
    expect(link.getAttribute("href")).toBe("/articles/new");
  });

  it("Create Article: title/body/category fields + Submit, all disabled", () => {
    renderIn(<CreateArticlePage />);
    for (const el of [...screen.queryAllByRole("textbox"), ...screen.queryAllByRole("combobox")]) {
      expect(el.hasAttribute("disabled")).toBe(true);
    }
    expect(screen.getByRole("button", { name: "Submit Post" }).hasAttribute("disabled")).toBe(true);
  });

  it("Categories: sample table + Add Category link", () => {
    renderIn(<CategoriesPage />);
    expect(screen.getByRole("link", { name: "Add Category" }).getAttribute("href")).toBe(
      "/categories/new",
    );
  });

  it("Add Category: disabled name field + Submit", () => {
    renderIn(<AddCategoryPage />);
    expect(screen.getByRole("textbox").hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Submit" }).hasAttribute("disabled")).toBe(true);
  });
});
