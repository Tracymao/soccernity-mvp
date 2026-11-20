import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CONTACT_CATEGORIES, CONTACT_ENQUIRY_STATUSES } from '../contact.constants';

// GET /admin/contact-enquiries. Section 5.5: keyset-paginated, opaque cursor, default 20 / max 50. `status`
// and `category` are optional exact-match filters ANDed with the cursor; a value outside the lists is a 400.
export class ListContactEnquiriesQueryDto {
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
  @IsIn(CONTACT_ENQUIRY_STATUSES)
  status?: string;

  @IsOptional()
  @IsIn(CONTACT_CATEGORIES)
  category?: string;
}
