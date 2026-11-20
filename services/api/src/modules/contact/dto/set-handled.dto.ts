import { IsBoolean } from 'class-validator';

// PATCH /admin/contact-enquiries/:id/handled. true = mark handled, false = reopen.
export class SetContactEnquiryHandledDto {
  @IsBoolean()
  handled!: boolean;
}
