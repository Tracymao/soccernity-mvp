import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { AuthRateLimitModule } from '../auth/rate-limit/rate-limit.module';
import { RegistrationEmailService } from '../auth/registration/email/registration-email.service';
import { ContactEnquiryRetentionService } from './contact-enquiry-retention.service';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';

// backend/w7-contact-us-enquiry (B-046), part A: the public submit route, storage, rate limits, the support
// notification and the retention job. Part B (the admin inbox: list, mark handled, escalate to a report) is
// not built here. ScheduleModule.forRoot() is registered once, globally, in app.module.ts.
//
// AuthFoundationModule: OptionalJwtAuthGuard and (through AuthLimitsModule) AuthLimitsStore.
// AuthRateLimitModule: the shared @AuthRateLimit() guard. RegistrationEmailService is provided here directly,
// the same way ModerationModule and AgeReclassificationModule do it (no dedicated email module exists).
@Module({
  imports: [AuthFoundationModule, AuthRateLimitModule, ConfigModule],
  controllers: [ContactController],
  providers: [ContactService, ContactEnquiryRetentionService, PrismaService, RegistrationEmailService],
})
export class ContactModule {}
