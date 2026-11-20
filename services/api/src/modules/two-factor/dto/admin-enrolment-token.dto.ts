import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// An admin who must enrol at sign-in presents the enrolment token the password step returned (never a session).
export class AdminEnrolmentTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  enrolmentToken!: string;
}

export class AdminEnrolmentConfirmDto extends AdminEnrolmentTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code!: string;
}
