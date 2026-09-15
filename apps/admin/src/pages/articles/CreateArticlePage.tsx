// Create New Post — Figma node 124:313.
//
// Real data: POST /admin/articles (Build Plan Section 4.8, built by
// sprint-5/admin-articles-categories-backend). Title/body/category are
// wired and submittable. Image attachment is DELIBERATELY still a
// disabled stub — the Media backend (services/api's MediaAsset model has
// no module/endpoints yet) doesn't exist, and Article has no image
// relation at all, per this PR's own explicit scope. Ships once the
// Media library backend exists.
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { AdminApiError } from "../../api/adminClient";
import { createArticle, listCategories, type Category } from "../../api/adminContent";
import { useAsyncData } from "../content/adminContentShared";
import "../content/content.css";

export default function CreateArticlePage() {
  const navigate = useNavigate();
  const { data: categoryPage, loading: loadingCategories, error: categoryError } = useAsyncData(
    () => listCategories({ status: "active", limit: 50 }),
    [],
  );
  const categories: Category[] = categoryPage?.items ?? [];

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canSubmit = title.trim().length > 0 && body.trim().length > 0 && categoryId.length > 0;

  const handleSubmit = async () => {
    setError(null);
    if (!canSubmit) {
      setError("Title, article body, and category are all required.");
      return;
    }
    setSaving(true);
    try {
      const created = await createArticle({ title: title.trim(), body: body.trim(), categoryId });
      navigate("/articles", { state: { createdArticleId: created.id } });
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't create the article. Please try again.");
      setSaving(false);
    }
  };

  return (
    <>
      <div className="ac-back">
        <Link to="/articles">← Articles</Link>
      </div>
      <AdminPageHeader title="Create New Post" hideSearch />
      <div className="ac-page">
        {error ? (
          <p className="ac-error" role="alert">
            {error}
          </p>
        ) : null}

        <label className="ac-field">
          <span>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} disabled={saving} />
        </label>

        <label className="ac-field">
          <span>Article body</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} disabled={saving} />
        </label>

        <label className="ac-field">
          <span>Category</span>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={saving || loadingCategories}>
            <option value="">{loadingCategories ? "Loading categories…" : "Select category…"}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {categoryError ? <span className="ac-hint">Couldn't load categories: {categoryError}</span> : null}
          {!loadingCategories && !categoryError && categories.length === 0 ? (
            <span className="ac-hint">
              No active categories exist yet — <Link to="/categories/new">add one first</Link>.
            </span>
          ) : null}
        </label>

        <div>
          <p className="ac-note">Add up to 5 images, each no larger than 50 MB.</p>
          <div className="ac-action-row">
            <button type="button" className="ac-btn ac-btn--outline" disabled title="Not available yet">
              Upload Images
            </button>
          </div>
          <p className="ac-hint">Image attachment ships once the Media library backend exists.</p>
        </div>

        <div className="ac-action-row">
          <button type="button" className="ac-btn ac-btn--primary" onClick={handleSubmit} disabled={saving || !canSubmit}>
            {saving ? "Submitting…" : "Submit Post"}
          </button>
        </div>
      </div>
    </>
  );
}
