import { IsString } from 'class-validator';

// POST /admin/users/:id/guardian-notices/{withhold,clear} (B-280, Decision Log #458) and .../review. Only
// "a string" is checked here; the trimmed length (10 to 1000, WITHHOLD_TEXT_*) is checked in the service, after the
// trim, so a reason made of spaces is refused and the rule has one home. A missing or non-string value is a 400.
export class GuardianNoticesReasonDto {
  @IsString()
  reason!: string;
}

export class GuardianNoticesReviewDto {
  @IsString()
  note!: string;
}
