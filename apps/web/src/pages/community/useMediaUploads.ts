// The upload state machine behind the composer's attach controls and the Week 4 final-entry upload
// (FC10, B-240; Decision Log #419; Figma pass Q composer frames 01-11 and final-entry frames 01-05).
//
// One item per chosen file:
//   uploading  the server issued a one-time link and the browser is sending the file (progress, Cancel)
//   checking   confirmed: stored, metadata stripped, waiting for the automatic check or a moderator.
//              Only the uploader can see it. Polled (GET /media/uploads/:id) until it is decided.
//   approved   other people can see it once the post is out
//   rejected   a reason is shown; the file must be removed before the post can go out
//   error      the upload itself failed (network, too large, wrong type, too long); Try again
//
// A post can be published when there is at least one item, every item is `checking` or `approved`, and
// none is still `uploading` (a file that is merely under review still attaches: the post is then visible to
// its author only until the file is approved, services/api post-media-visibility.util.ts).
//
// "Uploads aren't available right now" (Figma state 11) is the server's 503 `uploads_unavailable`: the
// attach controls are disabled for the rest of the session and a plain text post still works.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  POST_MEDIA_CODES,
  PostMediaApiError,
  confirmUpload,
  createUpload,
  deleteUpload,
  getUpload,
  putFile,
  type PostMediaKind,
  type PostMediaView,
} from "../../api/postMedia";

export type UploadPhase = "uploading" | "checking" | "approved" | "rejected" | "error";

export interface UploadItem {
  key: string;
  name: string;
  kind: PostMediaKind;
  /** An object URL for a picture's thumbnail, or null (videos, and environments without object URLs). */
  previewUrl: string | null;
  phase: UploadPhase;
  /** 0..1 while uploading. */
  progress: number;
  /** True between the end of the PUT and the end of the server's processing. */
  processing: boolean;
  /** The server's id once a link was issued. */
  id: string | null;
  rejectionReason: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

interface Options {
  accessToken: string;
  /** "video" = the final entry: exactly one video, no pictures. */
  only?: PostMediaKind;
  /** Most pictures per post (the server's own limit is 10). */
  maxImages?: number;
}

export const POLL_INTERVAL_MS = 3000;

let counter = 0;
function nextKey(): string {
  counter += 1;
  return `upload-${counter}`;
}

function kindOf(file: File): PostMediaKind {
  return file.type.startsWith("video/") ? "video" : "image";
}

function makePreview(file: File, kind: PostMediaKind): string | null {
  if (kind !== "image" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return null;
  try {
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
}

function revoke(url: string | null) {
  if (url && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
}

function fromView(view: PostMediaView): Pick<UploadItem, "phase" | "rejectionReason"> {
  if (view.status === "approved") return { phase: "approved", rejectionReason: null };
  if (view.status === "rejected") return { phase: "rejected", rejectionReason: view.rejectionReason };
  return { phase: "checking", rejectionReason: null };
}

export function useMediaUploads({ accessToken, only, maxImages = 10 }: Options) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [uploadsUnavailable, setUploadsUnavailable] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const itemsRef = useRef<UploadItem[]>([]);
  itemsRef.current = items;
  const files = useRef(new Map<string, File>());
  const controllers = useRef(new Map<string, AbortController>());
  const mounted = useRef(true);

  const patch = useCallback((key: string, change: Partial<UploadItem>) => {
    if (!mounted.current) return;
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)));
  }, []);

  const removeLocal = useCallback((key: string) => {
    const item = itemsRef.current.find((i) => i.key === key);
    revoke(item?.previewUrl ?? null);
    files.current.delete(key);
    if (mounted.current) setItems((current) => current.filter((i) => i.key !== key));
  }, []);

  const run = useCallback(
    async (key: string) => {
      const file = files.current.get(key);
      if (!file) return;
      const controller = new AbortController();
      controllers.current.set(key, controller);
      patch(key, { phase: "uploading", progress: 0, processing: false, errorCode: null, errorMessage: null });
      try {
        const link = await createUpload(accessToken, { contentType: file.type, size: file.size });
        patch(key, { id: link.id });
        await putFile(link, file, (fraction) => patch(key, { progress: fraction }), controller.signal);
        patch(key, { processing: true, progress: 1 });
        const view = await confirmUpload(accessToken, link.id);
        patch(key, { processing: false, ...fromView(view) });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return; // Cancel removes the item itself
        if (err instanceof PostMediaApiError && err.code === POST_MEDIA_CODES.uploadsUnavailable) {
          if (mounted.current) setUploadsUnavailable(true);
          // Nothing was stored; drop the item rather than leave a failed card behind.
          removeLocal(key);
          return;
        }
        patch(key, {
          phase: "error",
          processing: false,
          errorCode: err instanceof PostMediaApiError ? (err.code ?? null) : null,
          errorMessage: err instanceof PostMediaApiError ? err.message : "Check your connection and try again.",
        });
      } finally {
        controllers.current.delete(key);
      }
    },
    [accessToken, patch, removeLocal],
  );

  const addFiles = useCallback(
    (picked: File[]) => {
      setNotice(null);
      const next: UploadItem[] = [];
      let imageCount = itemsRef.current.filter((i) => i.kind === "image").length;
      let videoCount = itemsRef.current.filter((i) => i.kind === "video").length;
      for (const file of picked) {
        const kind = kindOf(file);
        if (only && kind !== only) {
          setNotice(only === "video" ? "Choose a video." : "Choose a picture.");
          continue;
        }
        if (kind === "video") {
          if (videoCount >= 1) {
            setNotice("You can add one video to a post.");
            continue;
          }
          videoCount += 1;
        } else {
          if (imageCount >= maxImages) {
            setNotice(`You can add up to ${maxImages} pictures to a post.`);
            continue;
          }
          imageCount += 1;
        }
        const key = nextKey();
        files.current.set(key, file);
        next.push({
          key,
          name: file.name,
          kind,
          previewUrl: makePreview(file, kind),
          phase: "uploading",
          progress: 0,
          processing: false,
          id: null,
          rejectionReason: null,
          errorCode: null,
          errorMessage: null,
        });
      }
      if (next.length === 0) return;
      setItems((current) => [...current, ...next]);
      for (const item of next) void run(item.key);
    },
    [only, maxImages, run],
  );

  /** Cancel an upload that is still sending: abort the PUT and forget the file. */
  const cancel = useCallback(
    (key: string) => {
      const item = itemsRef.current.find((i) => i.key === key);
      controllers.current.get(key)?.abort();
      removeLocal(key);
      if (item?.id) void deleteUpload(accessToken, item.id).catch(() => undefined);
    },
    [accessToken, removeLocal],
  );

  /** Remove a file that finished (under review, approved, rejected or failed): also deletes it on the server. */
  const remove = useCallback(
    async (key: string) => {
      const item = itemsRef.current.find((i) => i.key === key);
      if (item?.id && item.phase !== "error") {
        try {
          await deleteUpload(accessToken, item.id);
        } catch (err) {
          patch(key, { errorMessage: err instanceof PostMediaApiError ? err.message : "Couldn't remove that file." });
          return;
        }
      } else if (item?.id) {
        void deleteUpload(accessToken, item.id).catch(() => undefined);
      }
      removeLocal(key);
    },
    [accessToken, patch, removeLocal],
  );

  const retry = useCallback(
    (key: string) => {
      const item = itemsRef.current.find((i) => i.key === key);
      if (item?.id) void deleteUpload(accessToken, item.id).catch(() => undefined);
      patch(key, { id: null });
      void run(key);
    },
    [accessToken, patch, run],
  );

  /** Throw away everything chosen so far (the person switched tabs): cancel what is sending, delete what is stored. */
  const discard = useCallback(() => {
    for (const item of itemsRef.current) {
      if (item.phase === "uploading") cancel(item.key);
      else void remove(item.key);
    }
  }, [cancel, remove]);

  /** After the post is published: the uploads now belong to it, so just forget them locally. */
  const clear = useCallback(() => {
    for (const item of itemsRef.current) revoke(item.previewUrl);
    files.current.clear();
    if (mounted.current) {
      setItems([]);
      setNotice(null);
    }
  }, []);

  // Poll the files that are waiting for a decision.
  const anyChecking = items.some((i) => i.phase === "checking" && i.id);
  useEffect(() => {
    if (!anyChecking) return undefined;
    const timer = setInterval(() => {
      for (const item of itemsRef.current) {
        if (item.phase !== "checking" || !item.id) continue;
        getUpload(accessToken, item.id)
          .then((view) => patch(item.key, fromView(view)))
          .catch(() => undefined); // a failed poll just tries again on the next tick
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [anyChecking, accessToken, patch]);

  useEffect(() => {
    mounted.current = true;
    const live = controllers.current;
    return () => {
      mounted.current = false;
      for (const controller of live.values()) controller.abort();
      for (const item of itemsRef.current) revoke(item.previewUrl);
    };
  }, []);

  const mediaIds = useMemo(
    () => items.filter((i) => i.id && (i.phase === "checking" || i.phase === "approved")).map((i) => i.id as string),
    [items],
  );
  const busy = items.some((i) => i.phase === "uploading");
  const blocked = items.some((i) => i.phase === "rejected" || i.phase === "error");
  const canPublish = !busy && !blocked;

  return { items, mediaIds, busy, blocked, canPublish, uploadsUnavailable, notice, addFiles, cancel, remove, retry, clear, discard };
}
