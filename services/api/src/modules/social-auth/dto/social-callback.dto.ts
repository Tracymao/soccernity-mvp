import { IsString, MaxLength, MinLength } from 'class-validator';

// POST /auth/social/:provider/callback: what the provider's redirect handed to the web app. The length caps only stop
// absurd input; the state is looked up, the code is checked by the provider.
export class SocialCallbackDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  state!: string;
}
