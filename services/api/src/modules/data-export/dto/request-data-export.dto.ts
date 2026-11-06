import { IsNotEmpty, IsString } from 'class-validator';

// POST /users/me/data-export. The password re-confirms that the person at the keyboard is the account holder (the
// same re-entry change-password, deactivate and delete require). Not length-limited here: it is only compared.
export class RequestDataExportDto {
  @IsString()
  @IsNotEmpty()
  password!: string;
}
