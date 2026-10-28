import { StorageService } from './storage.service';

// backend/w14-post-media-pipeline (B-041; Decision Log #419). The extra capabilities the user-media
// pipeline needs on top of plain upload()/delete(): a one-time upload link, and reading an object back to
// the server for verification. A SUBCLASS of StorageService (not more abstract methods on it) so the many
// callers that only upload or delete -- and the specs that fake just those two methods -- are untouched.
//
// Every method throws a 503 (ServiceUnavailableException) when no object store is configured, like
// upload()/delete().
export abstract class DirectUploadStorageService extends StorageService {
  /**
   * A ONE-TIME link the browser PUTs the file to. The link is bound to `contentType` and
   * `contentLength` (they are part of the signature on a real store), so a client cannot swap the
   * type or size after the server validated the declaration; the server re-checks both on confirm
   * anyway. `headers` are the headers the client MUST send with the PUT.
   */
  abstract createUploadUrl(
    key: string,
    contentType: string,
    contentLength: number,
    expiresInSeconds: number,
  ): Promise<{ url: string; headers: Record<string, string> }>;

  /** Size and content type of the object at `key`, or null if it does not exist. */
  abstract head(key: string): Promise<{ size: number; contentType: string | null } | null>;

  /** Streams the object at `key` into the local file `destPath` (never into memory). */
  abstract downloadToFile(key: string, destPath: string): Promise<void>;

  /** Streams the local file at `filePath` to `key` and returns its public URL (like upload()). */
  abstract uploadFile(filePath: string, key: string, contentType: string): Promise<string>;

  /**
   * A SHORT-LIVED link a moderator's browser can GET to view the object at `key` (backend/w15-media-
   * review-queue, B-037). It expires after `expiresInSeconds`; it is never stored.
   */
  abstract createDownloadUrl(key: string, expiresInSeconds: number): Promise<string>;

  /**
   * backend/media-privacy-vetting-followups (B-257; Decision Log #430 item 2). A server-side copy of the
   * object at `sourceKey` to `destKey` (the bytes never pass through the API), keeping `contentType`. Used
   * to publish an approved file from the PRIVATE prefix to the PUBLIC one, and to move a rejected or held
   * file back. The caller verifies the copy with head() before relying on it.
   */
  abstract copyObject(sourceKey: string, destKey: string, contentType: string): Promise<void>;

  /**
   * The public URL `key` WOULD have (the same base upload() returns). Pure: no network call, and it says
   * nothing about whether an object exists there. Lets a post point at a file's future public location
   * while the file is still private.
   */
  abstract publicUrlFor(key: string): string;
}
