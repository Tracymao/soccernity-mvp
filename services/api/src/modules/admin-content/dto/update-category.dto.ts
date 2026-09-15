import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CATEGORY_STATUSES, CategoryStatus } from '../admin-content.constants';

// PATCH /admin/categories/:id — a genuine addition beyond Section 4.8's
// literal POST-only line (see admin-content/README.md's Decision Log
// candidate). Covers two real, distinct actions: renaming a category
// (slug is re-derived server-side from the new `name`, never accepted
// directly) and the active/inactive status toggle CategoriesPage.tsx's
// own Figma design already shows. Both fields optional — a caller can
// send either, both, or neither (a no-op PATCH).
export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(CATEGORY_STATUSES)
  status?: CategoryStatus;
}
