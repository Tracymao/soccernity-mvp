// Media Upload — Figma nodes 916:2362 (step 1: choose) and 917:24 (step
// 2: files selected).
//
// Real data: POST /admin/media/upload (Build Plan Section 4.8, built by
// sprint-5/admin-media-storage-backend) — single-file, so up to 5
// selected files are uploaded via up to 5 SEQUENTIAL calls, one per
// file, each with its own inline "uploading… / done / failed" row state
// (see api/adminMedia.ts's own comment: real byte-level upload progress
// isn't available through plain `fetch`, this is a disclosed coarser
// substitute). This is a client-side selection convenience, not a batch
// endpoint — see media/README.md's own "Key naming, MIME-type
// validation, and the '5 files' copy" section.
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { AdminApiError } from "../../api/adminClient";
import { uploadMedia } from "../../api/adminMedia";
import { formatBytes } from "./mediaShared";
import "./media.css";

const MAX_FILES = 5;
// Mirrors services/api's own MEDIA_MAX_FILE_SIZE_BYTES
// (media.constants.ts) — a client-side pre-check so an obviously
// oversized file is rejected immediately, without waiting on a round
// trip just to hit the server's own 413.
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

type FileStatus = "pending" | "uploading" | "done" | "failed";

interface SelectedFile {
  file: File;
  status: FileStatus;
  error?: string;
}

export default function MediaUploadPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<SelectedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function handlePick(fileList: FileList | null) {
    setFormError(null);
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList).slice(0, MAX_FILES);
    if (fileList.length > MAX_FILES) {
      setFormError(`You can select up to ${MAX_FILES} files at a time — the first ${MAX_FILES} were kept.`);
    }

    setSelected(
      files.map((file) => ({
        file,
        status: file.size > MAX_FILE_SIZE_BYTES ? "failed" : "pending",
        error: file.size > MAX_FILE_SIZE_BYTES ? "Exceeds the 50 MB limit." : undefined,
      })),
    );
  }

  const canUpload = selected.some((s) => s.status === "pending") && !uploading;

  async function handleUpload() {
    setUploading(true);
    for (let i = 0; i < selected.length; i += 1) {
      if (selected[i].status !== "pending") continue;
      setSelected((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: "uploading" } : s)));
      try {
        await uploadMedia(selected[i].file);
        setSelected((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: "done" } : s)));
      } catch (err) {
        const message = err instanceof AdminApiError ? err.message : "Upload failed. Please try again.";
        setSelected((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: "failed", error: message } : s)));
      }
    }
    setUploading(false);
  }

  const allDone = selected.length > 0 && selected.every((s) => s.status === "done");

  return (
    <>
      <div className="med-back">
        <Link to="/media">← Media</Link>
      </div>
      <AdminPageHeader title="Upload media" hideSearch />
      <div className="med-page">
        {formError ? (
          <p className="med-error" role="alert">
            {formError}
          </p>
        ) : null}

        <div className="med-dropzone">
          Select up to {MAX_FILES} media files (each no larger than 50 MB).
          <div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm"
              onChange={(e) => handlePick(e.target.files)}
              disabled={uploading}
            />
          </div>
        </div>

        {selected.length > 0 ? (
          <div>
            <p className="med-card__title" style={{ fontSize: 14 }}>
              Selected files
            </p>
            <div className="med-file-list">
              {selected.map((s, i) => (
                <div className="med-file-row" key={`${s.file.name}-${i}`}>
                  <span className="med-cell--truncate" title={s.file.name}>
                    {s.file.name} <span className="med-cell--secondary">({formatBytes(s.file.size)})</span>
                  </span>
                  <span className={`med-file-row__status med-file-row__status--${s.status}`}>
                    {s.status === "pending" && "Ready"}
                    {s.status === "uploading" && "Uploading…"}
                    {s.status === "done" && "Done"}
                    {s.status === "failed" && (s.error ?? "Failed")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="med-action-row">
          {allDone ? (
            <button type="button" className="med-btn med-btn--primary" onClick={() => navigate("/media")}>
              Back to Media
            </button>
          ) : (
            <button type="button" className="med-btn med-btn--primary" onClick={handleUpload} disabled={!canUpload}>
              {uploading ? "Uploading…" : "Upload"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
