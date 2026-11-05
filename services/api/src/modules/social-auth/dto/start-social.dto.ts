import { IsBoolean, IsOptional } from 'class-validator';

// POST /auth/social/:provider/start. The "Stay signed in" choice is made on the page that starts the flow and applied
// if the callback signs the person in (it decides the session cookie's lifetime, as for a password sign-in).
export class StartSocialDto {
  @IsOptional()
  @IsBoolean()
  staySignedIn?: boolean;
}
