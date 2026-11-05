import { Injectable, Logger, Optional } from '@nestjs/common';
import { DirectUploadStorageService } from '../../storage/direct-upload-storage.service';
import { POST_MEDIA_DEFAULTS } from '../post-media/post-media.config';
import { isPublicProfileKey } from './profile-image.util';

// backend/b036-avatar-cover-check (B-036; Decision Log #411 item 1). What URL the OWNER of a profile picture
// gets for it.
//
//   approved  -> the public URL stored on the user row (the file is in the public prefix);
//   otherwise -> a SHORT-LIVED signed link to the file in the PRIVATE prefix, made fresh on every read and never
//                stored (the same window the post-media view link and the moderator review link use,
//                POST_MEDIA_DEFAULTS.reviewViewUrlTtlSeconds). The public address is never used for a picture
//                that is pending, rejected or in review, so it cannot be fetched by anyone holding a URL.
//
// If a link cannot be made (no object store configured, or the store is down) the owner's response carries
// url: null for that picture rather than failing the whole request: the status is still returned.
export interface OwnerImageInput {
  /** The stored public URL (User.avatarUrl / coverUrl). */
  url: string | null;
  /** The file's current key (User.avatarKey / coverKey). */
  key: string | null;
  status: string | null;
}

@Injectable()
export class ProfileImageViewService {
  private readonly logger = new Logger(ProfileImageViewService.name);

  // Optional so a spec that builds a service without an object store keeps its shape; the module always provides it.
  constructor(@Optional() private readonly storage?: DirectUploadStorageService) {}

  /** Resolves the owner's URL for one picture, or null if there is none / none can be made. */
  async ownerUrl(image: OwnerImageInput): Promise<string | null> {
    if (!image.url || !image.status) return null;
    if (image.status === 'approved' && image.key && isPublicProfileKey(image.key)) return image.url;
    if (!image.key) return null;
    return this.signedLink(image.key);
  }

  /** A signed view link to the object at `key`, or null if one cannot be made. */
  async signedLink(key: string): Promise<string | null> {
    if (!this.storage) return null;
    try {
      return await this.storage.createDownloadUrl(key, POST_MEDIA_DEFAULTS.reviewViewUrlTtlSeconds);
    } catch (err) {
      this.logger.warn(`View link for profile picture ${key} not made (${err instanceof Error ? err.message : String(err)}).`);
      return null;
    }
  }
}
