// Admin Media client — services/api `/admin/media*` (Build Plan Section
// 4.8, built by sprint-5/admin-media-storage-backend). Wires
// MediaLibraryPage.tsx / MediaUploadPage.tsx / MediaPreviewPage.tsx to
// it — see that PR's README (services/api/src/modules/media/README.md)
// for the full guard/schema reasoning; response shapes mirror
// media.service.ts's own `MediaListItem` exactly.
//
// Every call goes through adminFetch (isolated admin auth path,
// ADMIN_JWT_SECRET, transparent 401->refresh — adminClient.ts /
// Decision Log #54). Every route here requires `editor` or `superadmin` —
// a `moderator` token gets a real 403 (AdminRolesGuard), on GET too — see
// admin-media.controller.ts's own header comment for why.
import { adminFetch } from "./adminClient";

export type MediaType = "image" | "video";

export interface MediaAsset {
  id: string;
  uploaderId: string;
  url: string;
  type: MediaType;
  size: number;
  createdAt: string;
}

export interface MediaListPage {
  items: MediaAsset[];
  nextCursor: string | null;
}

// GET /admin/media — keyset-paginated, one optional exact-match `type`
// filter.
export function listMedia(query: { type?: MediaType; cursor?: string; limit?: number } = {}): Promise<MediaListPage> {
  const params = new URLSearchParams();
  if (query.type) params.set("type", query.type);
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit) params.set("limit", String(query.limit));
  const qs = params.toString();
  return adminFetch<MediaListPage>(`/admin/media${qs ? `?${qs}` : ""}`);
}

// There is no GET /admin/media/:id anywhere in services/api —
// MediaPreviewPage.tsx is reached from MediaLibraryPage's own row link,
// which passes the row's already-fetched MediaAsset via router `state`
// (see ReportDetailPage.tsx's own identical precedent, and
// api/moderation.ts's matching `findReportById` comment). `findMediaById`
// below is the fallback for a DIRECT visit or a page refresh (no router
// state): it re-lists (unfiltered, so an image OR a video row is found
// regardless of type) and searches client-side for the matching id,
// bounded to a few pages so a very large media library can't turn a
// refresh into an unbounded crawl. If the asset isn't found within that
// bound, the page shows an honest "open it from the library instead"
// state rather than fabricating one.
//
// A real GET /admin/media/:id would remove this workaround entirely and
// is the more correct long-term fix; recorded as a Decision Log
// candidate in media/README.md, per this codebase's established
// "flag it, don't silently add one" instruction for exactly this shape
// of gap.
const FIND_BY_ID_MAX_PAGES = 5;

export async function findMediaById(id: string): Promise<MediaAsset | null> {
  let cursor: string | undefined;
  for (let page = 0; page < FIND_BY_ID_MAX_PAGES; page += 1) {
    const result = await listMedia({ cursor, limit: 50 });
    const found = result.items.find((m) => m.id === id);
    if (found) return found;
    if (!result.nextCursor) return null;
    cursor = result.nextCursor;
  }
  return null;
}

// POST /admin/media/upload — single-file multipart upload, field name
// `file` (matches the backend's own FileInterceptor('file', ...)). Real
// upload progress isn't available through plain `fetch` — a real
// progress bar would need XMLHttpRequest instead; MediaUploadPage.tsx's
// own per-file "uploading… / done / failed" states are a coarser,
// disclosed substitute, not a real byte-level progress readout.
export function uploadMedia(file: File): Promise<MediaAsset> {
  const formData = new FormData();
  formData.append("file", file);
  return adminFetch<MediaAsset>("/admin/media/upload", { method: "POST", body: formData });
}
