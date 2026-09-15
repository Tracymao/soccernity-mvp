import { IsString, MaxLength, MinLength } from 'class-validator';

// POST /admin/categories (Build Plan Section 4.8's literal line). `slug`
// is deliberately NOT a field here — it's derived server-side from
// `name` via slug.util.ts's slugify(), never trusted from the client
// (the task brief's own explicit instruction). `status` is also absent —
// a brand-new category is always created "active" (Category.status's own
// schema @default("active")); there's no real product need to create a
// category already retired.
export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
}
