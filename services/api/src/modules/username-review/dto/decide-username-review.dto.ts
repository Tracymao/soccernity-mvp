import { IsIn, IsString } from 'class-validator';
import { USERNAME_REVIEW_DECISIONS } from '../username-review.constants';

// POST /admin/username-reviews/:id/decide. `reason` is REQUIRED for both outcomes and its length (10 to 500 after
// trimming) is checked in the service, with a coded 400. It stays internal: it goes to the audit row only.
export class DecideUsernameReviewDto {
  @IsIn(USERNAME_REVIEW_DECISIONS)
  decision!: string;

  @IsString()
  reason!: string;
}
