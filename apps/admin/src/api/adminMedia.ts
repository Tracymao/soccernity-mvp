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

// GET /admin/media/:id — the real single-resource fetch that used to not
// exist (see MediaPreviewPage.tsx's own header comment for the workaround
// this route now supersedes: a router-state handoff from MediaLibraryPage's
// row link, plus a bounded re-list-and-search fallback for a direct
// visit/refresh — the same shape ReportDetailPage.tsx/api/moderation.ts's
// `getReportById`/`findReportById` pair already established). A
// non-existent id is a genuine 404 (AdminApiError with status 404); no
// additional gate beyond existence — MediaAsset has no analogous
// child-safety-vetting concept.
export function getMediaById(id: string): Promise<MediaAsset> {
  return adminFetch<MediaAsset>(`/admin/media/${id}`);
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
