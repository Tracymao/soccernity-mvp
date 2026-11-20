import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RecoveryRequestDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  password!: string;
}

export class RecoveryLinkTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token!: string;
}

export class RecoveryCancelDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  cancelToken!: string;
}
