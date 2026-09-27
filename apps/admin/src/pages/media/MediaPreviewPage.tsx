// Media Preview — Figma node 396:442.
//
// Real data: GET /admin/media/:id (Build Plan Section 4.8, built by
// sprint-5/admin-media-storage-backend; the GET single-resource route
// added separately — see api/adminMedia.ts's getMediaById comment). This
// screen is reached from MediaLibraryPage's own row link, which passes
// the row's already-fetched MediaAsset via router `state` (skipping a
// redundant fetch); a direct visit / refresh (no router state) now calls
// the real `getMediaById` instead of the old bounded-list-scan
// (`findMediaById`) workaround. The Figma screen has no primary action —
// it's the library list with a preview pane.
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { AdminApiError } from "../../api/adminClient";
import { getMediaById, type MediaAsset } from "../../api/adminMedia";
import { displayNameFromUrl, formatBytes, formatDate } from "./mediaShared";
import "./media.css";

type LoadState = "loading" | "loaded" | "not-found" | "error";

export default function MediaPreviewPage() {
  const { id = "" } = useParams();
  const location = useLocation() as { state?: { media?: MediaAsset } };
  const navigate = useNavigate();

  const [media, setMedia] = useState<MediaAsset | null>(location.state?.media ?? null);
  const [loadState, setLoadState] = useState<LoadState>(media ? "loaded" : "loading");

  useEffect(() => {
    if (media) return;
    let cancelled = false;
    getMediaById(id)
      .then((found) => {
        if (cancelled) return;
        setMedia(found);
        setLoadState("loaded");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof AdminApiError && err.status === 404) {
          setLoadState("not-found");
        } else {
          setLoadState("error");
        }
      });
    return () => {
      cancelled = true;
    };
    // Only re-runs if `id` changes — `media` is intentionally excluded.
  }, [id]);

  const backLink = (
    <div className="med-back">
      <Link to="/media">← Media</Link>
    </div>
  );

  if (loadState === "loading") {
    return (
      <>
        <AdminPageHeader title="Media preview" hideSearch />
        <div className="med-page">
          {backLink}
          <p className="med-loading">Loading the file…</p>
        </div>
      </>
    );
  }

  if (loadState === "not-found" || loadState === "error" || !media) {
    return (
      <>
        <AdminPageHeader title="Media preview" hideSearch />
        <div className="med-page">
          {backLink}
          <div className="med-card">
            <h2 className="med-card__title">File not found</h2>
            <p className="med-note">
              {loadState === "error"
                ? "Couldn’t load this file. Please try again from the library."
                : "No file exists with this id — open it directly from the Media library instead of a bookmarked link."}
            </p>
            <div className="med-action-row">
              <button type="button" className="med-btn med-btn--primary" onClick={() => navigate("/media")}>
                Back to Media
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  const name = displayNameFromUrl(media.url);

  return (
    <>
      <AdminPageHeader title="Media preview" hideSearch />
      <div className="med-page">
        {backLink}

        <div className="med-preview">
          {media.type === "image" ? (
            <img src={media.url} alt={name} />
          ) : (
            <video src={media.url} controls />
          )}
        </div>

        <div className="med-card">
          <div className="med-field">
            <span className="med-field__label">Name</span>
            <span className="med-field__value">{name}</span>
          </div>
          <div className="med-field">
            <span className="med-field__label">Uploaded</span>
            <span className="med-field__value">{formatDate(media.createdAt)}</span>
          </div>
          <div className="med-field">
            <span className="med-field__label">File size</span>
            <span className="med-field__value">{formatBytes(media.size)}</span>
          </div>
          <div className="med-field">
            <span className="med-field__label">Type</span>
            <span className="med-field__value">{media.type}</span>
          </div>
        </div>
      </div>
    </>
  );
}
