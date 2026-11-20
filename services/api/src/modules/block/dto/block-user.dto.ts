import { IsOptional, IsString, MaxLength } from 'class-validator';
import { BLOCK_REASON_MAX_LENGTH } from '../block.util';

// POST /users/:id/block. The reason is optional free text (#396 C2), stored for
// the blocker's own reference only. Trimmed and an empty/whitespace-only value
// treated as absent by BlockService (this codebase's DTOs use no @Transform).
export class BlockUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(BLOCK_REASON_MAX_LENGTH)
  reason?: string;
}
