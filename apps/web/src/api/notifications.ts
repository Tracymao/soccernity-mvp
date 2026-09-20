// Notifications client -- Build Plan Section 4.7 (the Notifications
// slice). Backs NotificationCentrePage.tsx and Header.tsx's unread badge.
// The full NotificationsModule is merged in services/api
// (sprint-3/notifications-read-api; Decision Log #290) -- every function
// here hits a real endpoint, there is no dummy-data phase.
//
// Follows the api/*.ts convention (api/clubs.ts, api/messaging.ts,
// api/banter.ts, api/grassroots.ts): a shared authedFetch wrapper, a
// typed NotificationsApiError carrying `.status`, API_BASE_URL from
// VITE_API_BASE_URL, a Bearer access-token header on every call,
// cursor-based pagination.
//
// Response shapes mirror services/api/src/modules/notifications/
// notifications.service.ts's NotificationView / NotificationPage exactly
// -- including that `data` is nullable (a stale/orphaned payloadRefId, or
// one of the four types with no stored actor -- see that module's own
// README for the full per-type table) and is structured data, not
// pre-rendered copy (Decision Log #290's own denormalization decision --
// copy stays this app's concern, per the finalized Notification Centre
// design, Decision Log #279).
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export interface NotificationActor {
  id: string;
  displayName: string;
}

// like / comment -- payloadRefId is the Post, not an actor. There is
// genuinely no liker/commenter identity anywhere in this data (see
// notifications/README.md's disclosed Decision Log candidate) -- the UI
// can say WHAT was liked/commented on, never WHO did it.
export interface NotificationPost {
  id: string;
  contentText: string;
  authorId: string;
}

export interface NotificationOtherParticipant {
  id: string;
  displayName: string | null;
}

export interface NotificationFixture {
  id: string;
  teamAName: string;
  teamBName: string | null;
  scheduledAt: string;
  status: string;
  result: { scoreA: number; scoreB: number } | null;
}

export interface NotificationContestCycle {
  id: string;
  title: string;
}

export type NotificationData =
  | { actor: NotificationActor }
  | { post: NotificationPost }
  | { conversationId: string; otherParticipant: NotificationOtherParticipant | null }
  | { fixture: NotificationFixture }
  | { cycle: NotificationContestCycle }
  // age_milestone: only the milestone key (e.g. 'under_16_lifted') is
  // resolved server-side; copy is this app's concern.
  | { milestone: string };

export interface Notification {
  id: string;
  type: string;
  read: boolean;
  createdAt: string;
  payloadRefId: string | null;
  data: NotificationData | null;
}

export interface NotificationPage {
  items: Notification[];
  nextCursor: string | null;
  unreadCount: number;
}

export interface MarkAllReadResult {
  markedRead: number;
}

export class NotificationsApiError extends Error {
  readonly status?: number;

  constructor(message: string, options?: { status?: number }) {
    super(message);
    this.name = "NotificationsApiError";
    this.status = options?.status;
  }
}

interface AuthedFetchInit {
  method?: string;
  body?: string;
}

async function authedFetch(path: string, accessToken: string, init?: AuthedFetchInit): Promise<Response> {
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      method: init?.method,
      body: init?.body,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
    });
  } catch {
    throw new NotificationsApiError("Couldn't reach the Soccernity server.");
  }
}

// GET /notifications -- the caller's inbox, keyset-paginated
// newest-first. Also returns `unreadCount` (see notifications.service.ts's
// own comment on why this is computed alongside every page, not just via
// the dedicated endpoint below).
export async function listNotifications(accessToken: string, cursor?: string): Promise<NotificationPage> {
  const url = new URL(`${API_BASE_URL}/notifications`);
  if (cursor) url.searchParams.set("cursor", cursor);

  const response = await authedFetch(url.pathname + url.search, accessToken);
  if (!response.ok) {
    throw new NotificationsApiError(`Couldn't load your notifications (${response.status}).`, {
      status: response.status,
    });
  }
  return (await response.json()) as NotificationPage;
}

// GET /notifications/unread-count -- a single COUNT query, cheap enough
// to call on every page load for the Navbar avatar's "Has Unread" dot and
// the account dropdown / drawer's numeric badge.
export async function getUnreadCount(accessToken: string): Promise<number> {
  const response = await authedFetch("/notifications/unread-count", accessToken);
  if (!response.ok) {
    throw new NotificationsApiError(`Couldn't load your unread count (${response.status}).`, {
      status: response.status,
    });
  }
  const body = (await response.json()) as { unreadCount: number };
  return body.unreadCount;
}

// PATCH /notifications/:id/read -- marks one notification read.
// Idempotent; returns the resolved item so the caller can update its own
// list from the response with no refetch.
export async function markNotificationRead(accessToken: string, notificationId: string): Promise<Notification> {
  const response = await authedFetch(`/notifications/${notificationId}/read`, accessToken, { method: "PATCH" });
  if (!response.ok) {
    throw new NotificationsApiError(`Couldn't mark that notification read (${response.status}).`, {
      status: response.status,
    });
  }
  return (await response.json()) as Notification;
}

// PATCH /notifications/read-all -- marks every unread row read for the
// caller.
export async function markAllNotificationsRead(accessToken: string): Promise<MarkAllReadResult> {
  const response = await authedFetch("/notifications/read-all", accessToken, { method: "PATCH" });
  if (!response.ok) {
    throw new NotificationsApiError(`Couldn't mark your notifications read (${response.status}).`, {
      status: response.status,
    });
  }
  return (await response.json()) as MarkAllReadResult;
}
