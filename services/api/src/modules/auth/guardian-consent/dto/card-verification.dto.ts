import { IsNotEmpty, IsString } from 'class-validator';

// Body for all three card-verification routes. Just the consent token --
// no card fields exist anywhere, and the global ValidationPipe's
// forbidNonWhitelisted rejects any extra key, so a client that mistakenly
// posts card data gets a 400 instead of having it silently accepted.
export class CardVerificationDto {
  @IsString()
  @IsNotEmpty()
  consentToken!: string;
}
