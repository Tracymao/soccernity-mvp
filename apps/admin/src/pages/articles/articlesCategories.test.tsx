import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AdminApiError } from "../../api/adminClient";

vi.mock("../../api/adminContent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/adminContent")>();
  return {
    ...actual,
    listArticles: vi.fn(),
    createArticle: vi.fn(),
    updateArticle: vi.fn(),
    listCategories: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
  };
});

import {
  listArticles,
  createArticle,
  updateArticle,
  listCategories,
  createCategory,
  updateCategory,
  type ArticleListItem,
  type Category,
} from "../../api/adminContent";
import ArticlesPage from "./ArticlesPage";
import CreateArticlePage from "./CreateArticlePage";
import CategoriesPage from "../categories/CategoriesPage";
import AddCategoryPage from "../categories/AddCategoryPage";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(listArticles).mockReset();
  vi.mocked(createArticle).mockReset();
  vi.mocked(updateArticle).mockReset();
  vi.mocked(listCategories).mockReset();
  vi.mocked(createCategory).mockReset();
  vi.mocked(updateCategory).mockReset();
});

function article(overrides: Partial<ArticleListItem> = {}): ArticleListItem {
  return {
    id: "article-1",
    title: "Zaha double helps Crystal Palace ease past Villa",
    status: "draft",
    categoryId: "category-1",
    category: { id: "category-1", name: "Premier League" },
    authorAdminId: "admin-1",
    publishedAt: null,
    createdAt: "2026-09-14T10:00:00.000Z",
    ...overrides,
  };
}

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: "category-1",
    name: "Premier League",
    slug: "premier-league",
    status: "active",
    createdAt: "2026-09-14T10:00:00.000Z",
    articleCount: 25,
    ...overrides,
  };
}

describe("ArticlesPage", () => {
  it("loads real articles and renders title/date/category/status", async () => {
    vi.mocked(listArticles).mockResolvedValue({ items: [article()], nextCursor: null });

    render(
      <MemoryRouter>
        <ArticlesPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(listArticles).toHaveBeenCalledWith({ status: undefined, limit: 50 }));
    expect(await screen.findByText("Zaha double helps Crystal Palace ease past Villa")).not.toBeNull();
    expect(screen.getByText("Premier League")).not.toBeNull();
    expect(screen.getByText("draft")).not.toBeNull();

    const link = screen.getByRole("link", { name: "Create Article" });
    expect(link.getAttribute("href")).toBe("/articles/new");
  });

  it("publishes a draft article via PATCH and reflects the result inline", async () => {
    vi.mocked(listArticles).mockResolvedValue({ items: [article()], nextCursor: null });
    vi.mocked(updateArticle).mockResolvedValue({
      ...article(),
      body: "A body",
      status: "published",
      publishedAt: "2026-09-15T00:00:00.000Z",
    });

    render(
      <MemoryRouter>
        <ArticlesPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Publish" }));

    await waitFor(() => expect(updateArticle).toHaveBeenCalledWith("article-1", { status: "published" }));
    expect(await screen.findByText("published")).not.toBeNull();
    expect(await screen.findByRole("button", { name: "Unpublish" })).not.toBeNull();
  });

  it("unpublishes a published article via PATCH", async () => {
    vi.mocked(listArticles).mockResolvedValue({ items: [article({ status: "published" })], nextCursor: null });
    vi.mocked(updateArticle).mockResolvedValue({ ...article({ status: "draft" }), body: "A body" });

    render(
      <MemoryRouter>
        <ArticlesPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Unpublish" }));

    await waitFor(() => expect(updateArticle).toHaveBeenCalledWith("article-1", { status: "draft" }));
    expect(await screen.findByRole("button", { name: "Publish" })).not.toBeNull();
  });

  it("surfaces a real backend error on a failed publish toggle without losing the row", async () => {
    vi.mocked(listArticles).mockResolvedValue({ items: [article()], nextCursor: null });
    vi.mocked(updateArticle).mockRejectedValue(new AdminApiError(500, "Server error"));

    render(
      <MemoryRouter>
        <ArticlesPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Publish" }));

    expect(await screen.findByText("Server error")).not.toBeNull();
    expect(screen.getByText("Zaha double helps Crystal Palace ease past Villa")).not.toBeNull();
  });

  it("filters by status when a tab is clicked", async () => {
    vi.mocked(listArticles).mockResolvedValue({ items: [], nextCursor: null });

    render(
      <MemoryRouter>
        <ArticlesPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(listArticles).toHaveBeenCalledWith({ status: undefined, limit: 50 }));
    fireEvent.click(screen.getByRole("button", { name: "Published" }));

    await waitFor(() => expect(listArticles).toHaveBeenLastCalledWith({ status: "published", limit: 50 }));
  });

  it("shows an empty state with no articles", async () => {
    vi.mocked(listArticles).mockResolvedValue({ items: [], nextCursor: null });

    render(
      <MemoryRouter>
        <ArticlesPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("No articles yet")).not.toBeNull();
  });

  it("surfaces a real backend error with a retry", async () => {
    vi.mocked(listArticles).mockRejectedValueOnce(new AdminApiError(500, "Server error"));
    vi.mocked(listArticles).mockResolvedValueOnce({ items: [article()], nextCursor: null });

    render(
      <MemoryRouter>
        <ArticlesPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Zaha double helps Crystal Palace ease past Villa")).not.toBeNull();
  });
});

describe("CreateArticlePage", () => {
  it("loads active categories and saves an article as a draft", async () => {
    vi.mocked(listCategories).mockResolvedValue({ items: [category()], nextCursor: null });
    vi.mocked(createArticle).mockResolvedValue({
      ...article(),
      body: "A body",
    });

    render(
      <MemoryRouter>
        <CreateArticlePage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(listCategories).toHaveBeenCalledWith({ status: "active", limit: 50 }));

    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), { target: { value: "A title" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Article body" }), { target: { value: "A body" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "category-1" } });

    fireEvent.click(screen.getByRole("button", { name: "Save as Draft" }));

    await waitFor(() =>
      expect(createArticle).toHaveBeenCalledWith({
        title: "A title",
        body: "A body",
        categoryId: "category-1",
        status: "draft",
      }),
    );
  });

  it("publishes a new article immediately via the Publish button", async () => {
    vi.mocked(listCategories).mockResolvedValue({ items: [category()], nextCursor: null });
    vi.mocked(createArticle).mockResolvedValue({
      ...article(),
      status: "published",
      body: "A body",
    });

    render(
      <MemoryRouter>
        <CreateArticlePage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(listCategories).toHaveBeenCalledWith({ status: "active", limit: 50 }));

    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), { target: { value: "A title" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Article body" }), { target: { value: "A body" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "category-1" } });

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() =>
      expect(createArticle).toHaveBeenCalledWith({
        title: "A title",
        body: "A body",
        categoryId: "category-1",
        status: "published",
      }),
    );
  });

  it("keeps both Save as Draft and Publish disabled until title/body/category are all filled", async () => {
    vi.mocked(listCategories).mockResolvedValue({ items: [category()], nextCursor: null });

    render(
      <MemoryRouter>
        <CreateArticlePage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(listCategories).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Save as Draft" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Publish" }).hasAttribute("disabled")).toBe(true);
  });

  it("renders the image-upload control disabled with a disclosed note", async () => {
    vi.mocked(listCategories).mockResolvedValue({ items: [], nextCursor: null });

    render(
      <MemoryRouter>
        <CreateArticlePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "Upload Images" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/image attachment ships once the Media library backend exists/i)).not.toBeNull();
  });
});

describe("CategoriesPage", () => {
  it("loads real categories and renders name/post-count/status", async () => {
    vi.mocked(listCategories).mockResolvedValue({ items: [category()], nextCursor: null });

    render(
      <MemoryRouter>
        <CategoriesPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(listCategories).toHaveBeenCalledWith({ status: undefined, limit: 50 }));
    expect(await screen.findByText("Premier League")).not.toBeNull();
    expect(screen.getByText("25")).not.toBeNull();
    expect(screen.getByText("active")).not.toBeNull();

    expect(screen.getByRole("link", { name: "Add Category" }).getAttribute("href")).toBe("/categories/new");
  });

  it("toggles a category's status via PATCH and reflects the result inline", async () => {
    vi.mocked(listCategories).mockResolvedValue({ items: [category()], nextCursor: null });
    vi.mocked(updateCategory).mockResolvedValue(category({ status: "inactive" }));

    render(
      <MemoryRouter>
        <CategoriesPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Deactivate" }));

    await waitFor(() => expect(updateCategory).toHaveBeenCalledWith("category-1", { status: "inactive" }));
    expect(await screen.findByText("inactive")).not.toBeNull();
    expect(await screen.findByRole("button", { name: "Activate" })).not.toBeNull();
  });

  it("surfaces a real backend error on a failed toggle without losing the row", async () => {
    vi.mocked(listCategories).mockResolvedValue({ items: [category()], nextCursor: null });
    vi.mocked(updateCategory).mockRejectedValue(new AdminApiError(500, "Server error"));

    render(
      <MemoryRouter>
        <CategoriesPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Deactivate" }));

    expect(await screen.findByText("Server error")).not.toBeNull();
    expect(screen.getByText("Premier League")).not.toBeNull();
  });
});

describe("AddCategoryPage", () => {
  it("creates a category and navigates back", async () => {
    vi.mocked(createCategory).mockResolvedValue(category());

    render(
      <MemoryRouter>
        <AddCategoryPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "La Liga" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(createCategory).toHaveBeenCalledWith({ name: "La Liga" }));
  });

  it("surfaces a friendly message on a duplicate-name 409", async () => {
    vi.mocked(createCategory).mockRejectedValue(new AdminApiError(409, "A category with this name already exists"));

    render(
      <MemoryRouter>
        <AddCategoryPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Premier League" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText("A category with this name already exists.")).not.toBeNull();
  });

  it("keeps Submit disabled with an empty name", () => {
    render(
      <MemoryRouter>
        <AddCategoryPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "Submit" }).hasAttribute("disabled")).toBe(true);
  });
});
