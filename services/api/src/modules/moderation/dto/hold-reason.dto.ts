import { IsString, MaxLength, MinLength } from 'class-validator';
import { HOLD_REASON_MAX_LENGTH, HOLD_REASON_MIN_LENGTH } from '../../account-hold/hold.service';

// backend/w6-hold-admin-endpoints (B-045; Decision Log #376, #398 D1, #403 item 8). Body of the three hold
// routes (place bad-faith, place legal hold, lift): a REQUIRED reason of 10 to 500 characters, the same bound
// HoldService enforces (the service also trims, so a reason that is only spaces is still a coded 400 there).
export class HoldReasonDto {
  @IsString()
  @MinLength(HOLD_REASON_MIN_LENGTH)
  @MaxLength(HOLD_REASON_MAX_LENGTH)
  reason!: string;
}
