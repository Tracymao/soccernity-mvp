// Notification Centre. Figma source: "Notification Centre — Feed (Read +
// Unread) — Desktop" (5640:7815) / mobile (5643:8003), "Notification
// Centre — Empty State — Desktop" (5642:7898) / mobile (5642:7997),
// "Soccernity-MVP" (weZWWqggy9j13eX8bhFgs6), from
// sprint-2/screen-builds-notification-centre and finalized by
// sprint-3/notification-centre-design-finalize (Decision Log #279).
// Route: /notifications.
//
// Real data only (Build Plan Section 4.7, NotificationsService):
//   - GET /notifications, cursor-paginated "Load more"     (api/notifications.ts)
//   - PATCH /notifications/:id/read, PATCH /notifications/read-all
//
// No-session handling mirrors Grassroots/Clubs/Leaderboard: a visit with
// no stored access token renders a "log in" prompt and never calls the
// API. GET /notifications is JwtAuthGuard-only, implicitly self-scoped.
//
// Row content per type, and the real, disclosed divergences from the
// Figma sample data (Decision Log #290's own denormalization decision):
//   - follow: real actor name (payloadRefId IS the follower's own id).
//   - like / comment: NO actor exists anywhere in this data — the Figma
//     frame's sample rows ("Aisha Kareem liked your post") are
//     illustrative and predate the backend's own confirmation of this
//     gap. Rendered as "Someone liked/commented on your post", the
//     established generic-fallback pattern this app already uses for
//     missing identity data (NavDrawer's "Signed in" row, the ghost
//     participant "?" initials) — not invented for this page.
//   - message: the real other participant's name (a Conversation is
//     always exactly 2 people).
//   - fixture_scheduled / result_logged: the real initiating team's name
//     (+ the real score, once logged).
//   - contest_win: only the cycle's title is resolvable server-side (no
//     round/position — the backend's own documented limitation), so this
//     renders "you won a round in {cycle title}", not Figma's illustrative
//     "you placed 1st this week".
//   - `data: null` (a stale/orphaned payloadRefId — Decision Log #290) is
//     rendered as a generic "This notification is no longer available."
//
// The "Unread" tab is a CLIENT-SIDE filter over already-loaded items —
// GET /notifications has no server-side unread-only query param
// (NotificationsQueryDto only takes cursor/limit). Flagged, not resolved
// here (a backend change is out of this PR's scope) — same discipline as
// ClubsPage's client-side name filter over loaded pages.
//
// Row click marks the notification read (if unread) and navigates to a
// real destination where one exists — /messages/:conversationId,
// /grassroots/fixtures/:fixtureId, /contest — and just marks read
// otherwise (follow/like/comment have no single-post or other-profile
// view built in this app yet).
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NotificationsApiError,
  type Notification,
} from "../api/notifications";
import { getStoredAccessToken } from "../lib/session";
import messagesIcon from "../assets/icons/messages.svg";
import navGrassroots from "../assets/icons/nav-grassroots.svg";
import notifWhistle from "../assets/icons/notif-whistle.svg";
import notifTrophy from "../assets/icons/notif-trophy.svg";
import notifBell from "../assets/icons/notif-bell.svg";
import "./notifications/NotificationCentrePage.css";

type LoadState = "loading" | "loaded" | "error" | "no-session";
type Tab = "all" | "unread";

// Same pattern as NavDrawer.tsx / PostCard.tsx / ProfilePage.tsx (a
// fourth small local copy — extracting a shared util is a nice-to-have,
// not done here).
function initialsFor(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

// Absolute date/time, matching MessagesPage.tsx / ConversationPage.tsx's
// own established convention — not the Figma sample's illustrative
// relative-time copy ("2 hours ago"), which this app has no existing
// utility for and isn't introducing one for here.
function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function linkFor(n: Notification): string | null {
  if (!n.data) return null;
  if (n.type === "message" && "conversationId" in n.data) return `/messages/${n.data.conversationId}`;
  if ((n.type === "fixture_scheduled" || n.type === "result_logged") && "fixture" in n.data) {
    return `/grassroots/fixtures/${n.data.fixture.id}`;
  }
  if (n.type === "contest_win") return "/contest";
  return null;
}

function bodyFor(n: Notification): { subject: string; rest: string } {
  const data = n.data;
  switch (n.type) {
    case "follow":
      return {
        subject: data && "actor" in data ? data.actor.displayName : "Someone",
        rest: " started following you",
      };
    case "like":
      return { subject: "Someone", rest: " liked your post" };
    case "comment":
      return { subject: "Someone", rest: " commented on your post" };
    case "message": {
      const name = data && "otherParticipant" in data ? (data.otherParticipant?.displayName ?? null) : null;
      return { subject: name ?? "Someone", rest: " sent you a message" };
    }
    case "fixture_scheduled": {
      const fixture = data && "fixture" in data ? data.fixture : null;
      return { subject: fixture?.teamAName ?? "A team", rest: " scheduled a fixture against your team" };
    }
    case "result_logged": {
      const fixture = data && "fixture" in data ? data.fixture : null;
      if (fixture?.result) {
        return {
          subject: fixture.teamAName,
          rest: ` ${fixture.result.scoreA}–${fixture.result.scoreB} — result logged for your fixture`,
        };
      }
      return { subject: "A result", rest: " was logged for your fixture" };
    }
    case "contest_win": {
      const cycle = data && "cycle" in data ? data.cycle : null;
      return { subject: "Contest", rest: cycle ? ` — you won a round in ${cycle.title}` : " — you won a round" };
    }
    case "age_milestone":
      // Plain, non-alarming, no age threshold in the copy (PR #277's
      // under-16 UI tone). Any milestone key gets the same message: the
      // only one the backend emits today is 'under_16_lifted'.
      return { subject: "Your account", rest: " now has access to more of Soccernity." };
    default:
      return { subject: "Notification", rest: "" };
  }
}

function RowAvatar({ notification }: { notification: Notification }) {
  const { type, data, read } = notification;
  const usesIconDisc = type === "message" || type === "fixture_scheduled" || type === "result_logged" || type === "contest_win" || type === "age_milestone";
  const className = usesIconDisc
    ? "notif-row__avatar notif-row__avatar--icon"
    : `notif-row__avatar ${read ? "notif-row__avatar--read" : "notif-row__avatar--unread"}`;

  if (type === "follow") {
    const name = data && "actor" in data ? data.actor.displayName : null;
    return <span className={className}>{name ? initialsFor(name) : "?"}</span>;
  }
  if (type === "like" || type === "comment") {
    return <span className={className}>?</span>;
  }
  if (type === "message") {
    return (
      <span className={className}>
        <img src={messagesIcon} alt="" width={22} height={20} />
      </span>
    );
  }
  if (type === "fixture_scheduled") {
    return (
      <span className={className}>
        <img src={navGrassroots} alt="" width={20} height={20} />
      </span>
    );
  }
  if (type === "result_logged") {
    return (
      <span className={className}>
        <img src={notifWhistle} alt="" width={20} height={20} />
      </span>
    );
  }
  if (type === "contest_win") {
    return (
      <span className={className}>
        <img src={notifTrophy} alt="" width={20} height={20} />
      </span>
    );
  }
  if (type === "age_milestone") {
    return (
      <span className={className} aria-hidden="true">
        ✓
      </span>
    );
  }
  return <span className={className}>?</span>;
}

interface RowProps {
  notification: Notification;
  onOpen: (n: Notification) => void;
}

function NotificationRow({ notification, onOpen }: RowProps) {
  const to = linkFor(notification);
  const { subject, rest } = bodyFor(notification);

  const content = (
    <>
      <RowAvatar notification={notification} />
      <span className="notif-row__body">
        {notification.data ? (
          <span className="notif-row__text">
            <strong>{subject}</strong>
            {rest}
          </span>
        ) : (
          <span className="notif-row__text notif-row__text--gone">This notification is no longer available.</span>
        )}
        <span className="notif-row__timestamp">{formatTimestamp(notification.createdAt)}</span>
      </span>
      {!notification.read && <span className="notif-row__dot" aria-hidden="true" />}
    </>
  );

  const rowClassName = `notif-row ${notification.read ? "notif-row--read" : "notif-row--unread"}`;

  if (to) {
    return (
      <Link to={to} className={rowClassName} onClick={() => onOpen(notification)}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={rowClassName} onClick={() => onOpen(notification)}>
      {content}
    </button>
  );
}

export default function NotificationCentrePage() {
  const token = getStoredAccessToken();
  const navigate = useNavigate();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [items, setItems] = useState<Notification[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [tab, setTab] = useState<Tab>("all");
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setLoadState("no-session");
      return;
    }
    setLoadState("loading");
    try {
      const page = await listNotifications(token);
      setItems(page.items);
      setCursor(page.nextCursor);
      setUnreadCount(page.unreadCount);
      setLoadState("loaded");
    } catch {
      setLoadState("error");
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function loadMore() {
    if (!token || !cursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const page = await listNotifications(token, cursor);
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
      setUnreadCount(page.unreadCount);
    } catch (err) {
      setLoadMoreError(err instanceof NotificationsApiError ? err.message : "Couldn't load more notifications.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleOpen(notification: Notification) {
    if (!token || notification.read) return;
    // Optimistic — the row moves to "read" immediately; a failure just
    // means it'll still show unread next load, no error surfaced for a
    // background housekeeping call.
    setItems((prev) => prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await markNotificationRead(token, notification.id);
    } catch {
      // Swallowed — see above.
    }
  }

  async function handleMarkAllRead() {
    if (!token || unreadCount === 0 || markingAll) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsRead(token);
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // Best-effort — the button stays clickable, nothing rendered breaks.
    } finally {
      setMarkingAll(false);
    }
  }

  if (loadState === "no-session") {
    return (
      <div className="notif-status" role="status">
        Log in to see your notifications. <Link to="/login">Log in</Link>
      </div>
    );
  }

  const visible = tab === "unread" ? items.filter((n) => !n.read) : items;
  const unreadGroup = tab === "all" ? visible.filter((n) => !n.read) : visible;
  const readGroup = tab === "all" ? visible.filter((n) => n.read) : [];

  return (
    <div className="notif-page">
      <header className="notif-page__header">
        <div className="notif-page__titles">
          <h1 className="notif-page__title">Notifications</h1>
          <p className="notif-page__subtitle">Follows, likes, comments, messages, fixtures, results and Contest wins.</p>
        </div>
        <button
          type="button"
          className="notif-mark-all"
          onClick={handleMarkAllRead}
          disabled={unreadCount === 0 || markingAll}
        >
          Mark all as read
        </button>
      </header>

      <div className="notif-tabs">
        <button
          type="button"
          className={`notif-tab ${tab === "all" ? "notif-tab--active" : ""}`}
          onClick={() => setTab("all")}
        >
          All
        </button>
        <button
          type="button"
          className={`notif-tab ${tab === "unread" ? "notif-tab--active" : ""}`}
          onClick={() => setTab("unread")}
        >
          Unread
          {unreadCount > 0 && <span className="notif-tab__badge">{unreadCount}</span>}
        </button>
      </div>

      {loadState === "loading" && (
        <p className="notif-status" role="status">
          Loading notifications…
        </p>
      )}

      {loadState === "error" && (
        <p className="notif-status notif-status--error" role="alert">
          Couldn&rsquo;t load your notifications. Please try again shortly.
        </p>
      )}

      {loadState === "loaded" && items.length === 0 && (
        <div className="notif-empty">
          <span className="notif-empty__icon" aria-hidden="true">
            <img src={notifBell} alt="" width={40} height={40} />
          </span>
          <p className="notif-empty__title">No notifications yet</p>
          <p className="notif-empty__body">
            When someone follows you, likes or comments on your post, sends you a message, schedules or logs a
            fixture result, or you win a Contest round, you&rsquo;ll see it here.
          </p>
          <p className="notif-empty__soon">
            More notification types — mentions, deeper Bants and Contest activity — are on the way.
          </p>
          <button type="button" className="notif-empty__cta" onClick={() => navigate("/community")}>
            Go to your feed
          </button>
        </div>
      )}

      {loadState === "loaded" && visible.length === 0 && items.length > 0 && (
        <p className="notif-status">No unread notifications.</p>
      )}

      {loadState === "loaded" && unreadGroup.length > 0 && (
        <>
          {tab === "all" && <p className="notif-group-label">NEW</p>}
          <div className="notif-list">
            {unreadGroup.map((n) => (
              <NotificationRow key={n.id} notification={n} onOpen={handleOpen} />
            ))}
          </div>
        </>
      )}

      {readGroup.length > 0 && (
        <>
          <p className="notif-group-label">EARLIER</p>
          <div className="notif-list">
            {readGroup.map((n) => (
              <NotificationRow key={n.id} notification={n} onOpen={handleOpen} />
            ))}
          </div>
        </>
      )}

      {cursor && loadState === "loaded" && (
        <button type="button" className="notif-load-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}

      {loadMoreError && (
        <p className="notif-status notif-status--error" role="alert">
          {loadMoreError}
        </p>
      )}
    </div>
  );
}
