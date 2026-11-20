import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { POST_MEDIA_REVIEW_SOURCES, PostMediaReviewSource } from '../../post-media/post-media-review.constants';

export const MEDIA_REVIEW_STATUS_FILTERS = ['pending', 'approved', 'rejected'] as const;
export type MediaReviewStatusFilter = (typeof MEDIA_REVIEW_STATUS_FILTERS)[number];

export const MEDIA_REVIEW_ORDERS = ['newest', 'oldest'] as const;
export type MediaReviewOrder = (typeof MEDIA_REVIEW_ORDERS)[number];

// GET /admin/media-review (B-037). Section 5.5: keyset-paginated, opaque cursor, default 20 / max 50.
//   status  'pending' (DEFAULT) = waiting for a decision (an uncertain item, or an approved one with open
//           reports); 'approved' / 'rejected' = items that went through the queue and were decided.
//   source  only items that entered via the automatic check, or only items that users reported.
//   order   newest or oldest first (by upload order).
export class ListMediaReviewQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsIn(MEDIA_REVIEW_ORDERS)
  order?: MediaReviewOrder;

  @IsOptional()
  @IsIn(POST_MEDIA_REVIEW_SOURCES as readonly string[])
  source?: PostMediaReviewSource;

  @IsOptional()
  @IsIn(MEDIA_REVIEW_STATUS_FILTERS)
  status?: MediaReviewStatusFilter;
}
