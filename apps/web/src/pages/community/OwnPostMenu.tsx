// "Post options" for a post the viewer authored: manage comment settings and
// delete. No Figma frame exists for this (a file-wide search found no
// post-level own-content menu), so it is built plainly with the same inline
// disclosure pattern ReportAction uses, and the same inline two-step confirm
// apps/admin's Users screen uses for an irreversible action.
//
// Delete is a real hard delete: it removes the post AND every comment, like
// and save on it, other people's included -- the confirm copy says so.
import { useState } from "react";
import {
  deletePost,
  FeedApiError,
  updateCommentSettings,
  type CommentPermission,
} from "../../api/feed";
import "./ReportAction.css";

interface OwnPostMenuProps {
  accessToken: string;
  postId: string;
  commentPermission: CommentPermission;
  onCommentPermissionChange: (next: CommentPermission) => void;
  onDeleted: () => void;
}

type Stage = "closed" | "menu" | "settings" | "confirm-delete";

export default function OwnPostMenu({
  accessToken,
  postId,
  commentPermission,
  onCommentPermissionChange,
  onDeleted,
}: OwnPostMenuProps) {
  const [stage, setStage] = useState<Stage>("closed");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commentsOn = commentPermission !== "off";

  async function save(next: CommentPermission) {
    if (busy || next === commentPermission) return;
    setBusy(true);
    setError(null);
    try {
      const result = await updateCommentSettings(accessToken, postId, next);
      onCommentPermissionChange(result.commentPermission);
    } catch (err) {
      setError(err instanceof FeedApiError ? err.message : "Couldn't update comment settings.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await deletePost(accessToken, postId);
      onDeleted();
    } catch (err) {
      setError(err instanceof FeedApiError ? err.message : "Couldn't delete that post.");
      setBusy(false);
    }
  }

  if (stage === "closed") {
    return (
      <button type="button" className="report-action__trigger" onClick={() => setStage("menu")} aria-haspopup="menu">
        Post options
      </button>
    );
  }

  if (stage === "menu") {
    return (
      <div className="report-action report-action__menu" role="menu">
        <button type="button" role="menuitem" className="report-action__menu-item" onClick={() => setStage("settings")}>
          Manage comment settings
        </button>
        <button
          type="button"
          role="menuitem"
          className="report-action__menu-item"
          onClick={() => setStage("confirm-delete")}
        >
          Delete post
        </button>
        <button type="button" className="report-action__menu-item report-action__menu-item--cancel" onClick={() => setStage("closed")}>
          Close
        </button>
      </div>
    );
  }

  if (stage === "settings") {
    return (
      <div className="report-action">
        <p className="report-action__target">Comment settings</p>
        <label>
          <input
            type="checkbox"
            checked={commentsOn}
            disabled={busy}
            onChange={(e) => save(e.target.checked ? "everyone" : "off")}
          />{" "}
          Allow comments
        </label>
        <label>
          Who can comment{" "}
          <select
            aria-label="Who can comment"
            value={commentsOn ? commentPermission : "everyone"}
            disabled={busy || !commentsOn}
            onChange={(e) => save(e.target.value as CommentPermission)}
          >
            <option value="everyone">Everyone</option>
            <option value="followers">People who follow me</option>
          </select>
        </label>
        <p className="report-action__target">
          Changes apply to new comments only. Existing comments stay put; hide individual ones from the comments list.
        </p>
        {error && (
          <p className="report-action__error" role="alert">
            {error}
          </p>
        )}
        <div className="report-action__buttons">
          <button type="button" className="report-action__cancel" onClick={() => setStage("closed")}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="report-action" role="alertdialog" aria-label="Confirm delete post">
      <p className="report-action__target">
        Delete this post? This permanently removes it and every comment, like and save on it, including other
        people&rsquo;s. This can&rsquo;t be undone.
      </p>
      {error && (
        <p className="report-action__error" role="alert">
          {error}
        </p>
      )}
      <div className="report-action__buttons">
        <button type="button" className="report-action__submit" onClick={confirmDelete} disabled={busy}>
          {busy ? "Deleting…" : "Delete post"}
        </button>
        <button type="button" className="report-action__cancel" onClick={() => setStage("menu")} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}
