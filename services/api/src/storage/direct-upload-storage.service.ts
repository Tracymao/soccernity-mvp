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
}
