import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { SkipGlobalWriteLimit } from '../../rate-limit/global-rate-limit.decorators';
import { AuthRateLimit } from '../auth/rate-limit/auth-rate-limit.decorator';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AccessTokenPayload } from '../auth/token/token.types';
import { ContactService } from './contact.service';
import { CreateContactEnquiryDto } from './dto/create-contact-enquiry.dto';

// POST /contact (B-046): the public Contact Us form. Open to everyone -- a guest, a signed-in user, and a
// restricted-pending or unverified account alike (write-route-guards.spec.ts pins that it carries no
// consent / email / profile guard): a person must always be able to write to support.
//
// OptionalJwtAuthGuard never rejects; it only fills request.user when a valid bearer token came with the
// request, so a signed-in sender's enquiry is linked to their account (needed to delete it with the account).
//
// Rate limits: the shared @AuthRateLimit() (per IP, the same one POST /reports/public uses) plus a per-email
// limit inside ContactService. @SkipGlobalWriteLimit() because this route carries its own limits (the
// coverage spec in rate-limit/ requires the tag on every @AuthRateLimit() handler).
@Controller('contact')
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  @SkipGlobalWriteLimit()
  @AuthRateLimit()
  @UseGuards(OptionalJwtAuthGuard)
  @Post()
  async submit(@Body() dto: CreateContactEnquiryDto, @CurrentUser() user: AccessTokenPayload | undefined) {
    return this.contact.submit(dto, user?.sub);
  }
}
