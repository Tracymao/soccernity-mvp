import { Type } from 'class-transformer';
import { IsDefined, IsNotEmpty, IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';
import { PUSH_ENDPOINT_MAX_LENGTH, PUSH_KEY_MAX_LENGTH } from '../push.constants';

export class PushSubscriptionKeysDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(PUSH_KEY_MAX_LENGTH)
  p256dh!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(PUSH_KEY_MAX_LENGTH)
  auth!: string;
}

// POST /notification-settings/push/subscription: the browser's PushSubscription.toJSON() shape. Browsers only issue
// https endpoints, so anything else is refused (it also keeps a stored endpoint from being used to make this server
// call an arbitrary non-https address).
export class CreatePushSubscriptionDto {
  @IsString()
  @MaxLength(PUSH_ENDPOINT_MAX_LENGTH)
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: true })
  endpoint!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;
}

export class DeletePushSubscriptionDto {
  @IsString()
  @MaxLength(PUSH_ENDPOINT_MAX_LENGTH)
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: true })
  endpoint!: string;
}
