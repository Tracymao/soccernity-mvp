// Add Category — Figma node 138:93.
//
// Real data: POST /admin/categories (Build Plan Section 4.8, built by
// sprint-5/admin-articles-categories-backend). The slug is derived
// server-side from the name — never sent from here.
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { AdminApiError } from "../../api/adminClient";
import { createCategory } from "../../api/adminContent";
import "../content/content.css";

export default function AddCategoryPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (name.trim().length === 0) {
      setError("Category name is required.");
      return;
    }
    setSaving(true);
    try {
      await createCategory({ name: name.trim() });
      navigate("/categories");
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 409) {
        setError("A category with this name already exists.");
      } else {
        setError(err instanceof AdminApiError ? err.message : "Couldn't create the category. Please try again.");
      }
      setSaving(false);
    }
  };

  return (
    <>
      <div className="ac-back">
        <Link to="/categories">← Categories</Link>
      </div>
      <AdminPageHeader title="Add a new category" hideSearch />
      <div className="ac-page">
        {error ? (
          <p className="ac-error" role="alert">
            {error}
          </p>
        ) : null}

        <label className="ac-field">
          <span>Category name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} disabled={saving} />
        </label>

        <div className="ac-action-row">
          <button
            type="button"
            className="ac-btn ac-btn--primary"
            onClick={handleSubmit}
            disabled={saving || name.trim().length === 0}
          >
            {saving ? "Submitting…" : "Submit"}
          </button>
        </div>
      </div>
    </>
  );
}
