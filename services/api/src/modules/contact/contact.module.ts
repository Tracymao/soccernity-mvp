import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuthFoundationModule } from '../admin/admin-auth-foundation.module';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { AuthRateLimitModule } from '../auth/rate-limit/rate-limit.module';
import { RegistrationEmailService } from '../auth/registration/email/registration-email.service';
import { ContactEnquiryAdminController } from './contact-enquiry-admin.controller';
import { ContactEnquiryAdminService } from './contact-enquiry-admin.service';
import { ContactEnquiryRetentionService } from './contact-enquiry-retention.service';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';

// backend/w7-contact-us-enquiry (B-046), part A: the public submit route, storage, rate limits, the support
// notification and the retention job. Part B (backend/w7-contact-enquiry-admin-escalate): the admin inbox (list,
// open, mark handled, escalate to a report), on the guards of AdminAuthFoundationModule. The audit rows are
// written inside the service's own transactions, so AdminActionLogModule is not needed.
// ScheduleModule.forRoot() is registered once, globally, in app.module.ts.
//
// AuthFoundationModule: OptionalJwtAuthGuard and (through AuthLimitsModule) AuthLimitsStore.
// AuthRateLimitModule: the shared @AuthRateLimit() guard. RegistrationEmailService is provided here directly,
// the same way ModerationModule and AgeReclassificationModule do it (no dedicated email module exists).
@Module({
  imports: [AuthFoundationModule, AdminAuthFoundationModule, AuthRateLimitModule, ConfigModule],
  controllers: [ContactController, ContactEnquiryAdminController],
  providers: [ContactService, ContactEnquiryAdminService, ContactEnquiryRetentionService, PrismaService, RegistrationEmailService],
})
export class ContactModule {}
