// One post on its own page. Route: /posts/:postId. Figma: "Community - Final Entry - Opened from the
// Final week carousel", desktop 6836:29397 / mobile 6836:29312 (pass O), built from the pinned-entry
// card and the Post View frame 5779:8490 (back bar, post, comments, composer).
//
// Why it exists: a Final week carousel tile "opens the entry itself" (Decision Log #403 item 11,
// build register B-092). There was no single-post page; this is the destination, and it works for
// any post the caller may see (`GET /posts/:id`).
//
// What it shows: the post in the ordinary PostCard (real like / comment / save / follow / report,
// the "Contest post" label for an entry), with the comment thread open straight away and a video
// played inline. A final entry is a 404 for everyone but its author until the reveal, and a Block
// hides an author in both directions; both are the same generic "Post not found", so nothing here
// distinguishes a hidden post from a missing one.
//
// Not here: any engagement count of a finalist video is a normal PostCard count (likes and comments
// are public once the entry is revealed; only IMPRESSIONS are never shown). The page itself never
// records an impression: only a carousel tile does (docs/contest-spec.md section 10b).
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { FeedApiError, getPostById, type FeedPost } from "../api/feed";
import { decodeAccessToken, getStoredAccessToken } from "../lib/session";
import PostCard from "./community/PostCard";
import "./community/CommunityPage.css";
import "./PostPage.css";

type LoadState = "loading" | "loaded" | "not-found" | "error";

export default function PostPage() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const token = getStoredAccessToken();
  const myId = token ? decodeAccessToken(token)?.sub : undefined;

  const [state, setState] = useState<LoadState>("loading");
  const [post, setPost] = useState<FeedPost | null>(null);

  useEffect(() => {
    if (!token || !postId) return;
    let cancelled = false;
    setState("loading");
    getPostById(token, postId)
      .then((result) => {
        if (cancelled) return;
        setPost(result);
        setState("loaded");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState(err instanceof FeedApiError && err.status === 404 ? "not-found" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [token, postId]);

  if (!token || !myId) {
    return (
      <div className="community-status" role="status">
        Log in to see this post. <Link to="/login">Log in</Link>
      </div>
    );
  }

  return (
    <div className="post-page">
      <div className="post-page__bar">
        <button type="button" className="post-page__back" onClick={() => navigate(-1)} aria-label="Back">
          &larr;
        </button>
        <h1 className="post-page__title">Post</h1>
      </div>

      {state === "loading" && (
        <div className="community-status" role="status">
          Loading…
        </div>
      )}
      {state === "not-found" && (
        <div className="community-status" role="status">
          Post not found. <Link to="/community">Back to Community</Link>
        </div>
      )}
      {state === "error" && (
        <div className="community-status community-status--error" role="alert">
          Couldn&rsquo;t load this post. Please try again shortly.
        </div>
      )}
      {state === "loaded" && post && (
        <PostCard post={post} accessToken={token} currentUserId={myId} initialCommentsOpen playVideo />
      )}
    </div>
  );
}
