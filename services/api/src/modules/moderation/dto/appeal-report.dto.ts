import { IsString, MaxLength, MinLength } from 'class-validator';

// POST /reports/:id/appeal — the second genuine spec-gap addition this
// PR builds. Section 4's API Contract Sketch has no literal line for an
// appeal-review endpoint either; Section 8.4's own workflow text
// describes the appeal step ("the reported user may appeal... a second
// admin/moderator reviews it, per Decision Log #138") without ever
// defining the route. Flagged as a Decision Log candidate in README.md.
export class AppealReportDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
