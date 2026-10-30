import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthLimitsStore, limitKey, normaliseEmail } from '../auth/rate-limit/auth-limits/auth-limits.store';
import { RegistrationEmailService } from '../auth/registration/email/registration-email.service';
import { buildWebAppLink } from '../auth/registration/email/web-app-link.util';
import { ContactConfig, readContactConfig } from './contact.config';
import {
  CONTACT_CATEGORY_LABELS,
  CONTACT_EMAIL_RATE_LIMITED_CODE,
  CONTACT_EMAIL_RATE_LIMITED_MESSAGE,
  ContactCategory,
} from './contact.constants';
import { CreateContactEnquiryDto } from './dto/create-contact-enquiry.dto';

// Where the admin inbox will live (part B of B-046, not built yet). A proposed path, veto-able; the email
// only links to it when ADMIN_APP_BASE_URL is usable.
export const ADMIN_CONTACT_INBOX_PATH = '/contact-enquiries';

export interface ContactSubmissionResult {
  received: true;
}

// backend/w7-contact-us-enquiry (B-046). The public Contact Us submit.
//
// What it does, in order:
//   1. the per-EMAIL limit (3 per hour by default), hashed and atomic (INCR) like the forgot-password limit,
//      through the same AuthLimitsStore (so it also gets that store's in-memory fallback if Redis is down);
//   2. stores the enquiry. userId is set only for a signed-in sender whose account is active;
//   3. tells the support mailbox ONE email with the category and a link to the admin inbox, never the text.
//
// The per-IP limit is the shared @AuthRateLimit() on the controller. Nothing here ever logs the message,
// subject, name or email.
@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);
  private readonly settings: ContactConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly store: AuthLimitsStore,
    private readonly email: RegistrationEmailService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {
    this.settings = readContactConfig({ get: (k) => config.get<string>(k) });
  }

  async submit(dto: CreateContactEnquiryDto, callerUserId?: string): Promise<ContactSubmissionResult> {
    await this.enforceEmailLimit(dto.email);
    const userId = await this.resolveUserId(callerUserId);

    await this.prisma.contactEnquiry.create({
      data: {
        name: dto.name,
        email: dto.email,
        category: dto.category,
        subject: dto.subject,
        message: dto.message,
        userId,
      },
      select: { id: true },
    });

    this.notifySupportInBackground(dto.category);
    return { received: true };
  }

  // 3 submissions per email address per hour (configurable). The key derives from the submitted address
  // alone (normalised, hashed), so the answer never depends on whether an account exists for it.
  private async enforceEmailLimit(rawEmail: string): Promise<void> {
    const windowSeconds = Math.max(1, Math.ceil(this.settings.emailRateLimitWindowMs / 1000));
    const hit = await this.store.hit(limitKey('contact-email', normaliseEmail(rawEmail)), windowSeconds);
    if (hit !== null && hit.count > this.settings.emailRateLimitMax) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          code: CONTACT_EMAIL_RATE_LIMITED_CODE,
          message: CONTACT_EMAIL_RATE_LIMITED_MESSAGE,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  // A valid token can outlive its account for a few minutes (sessions are revoked on deactivate / delete but
  // the 15-minute access token is not), and a purged account has no row at all. Link the enquiry only to an
  // account that is still active, otherwise store it as a guest's (the form works either way).
  private async resolveUserId(callerUserId: string | undefined): Promise<string | null> {
    if (!callerUserId) return null;
    const user = await this.prisma.user.findUnique({ where: { id: callerUserId }, select: { id: true, accountStatus: true } });
    return user && user.accountStatus === 'active' ? user.id : null;
  }

  // ONE email per new enquiry, to the support mailbox. Carries the category and (when ADMIN_APP_BASE_URL is
  // usable) a link to the admin inbox; NEVER the name, email, subject or message. Fire-and-forget: the
  // submission has already been stored and must not fail because an email could not be sent.
  private notifySupportInBackground(category: ContactCategory): void {
    const link = buildWebAppLink(this.config.get<string>('ADMIN_APP_BASE_URL'), ADMIN_CONTACT_INBOX_PATH, {});
    void this.email
      .sendContactEnquiryNotificationEmail(this.settings.supportInboxEmail, CONTACT_CATEGORY_LABELS[category], link)
      .catch((err) => {
        // No personal data: only that the notification failed.
        this.logger.warn(`Contact enquiry support notification failed: ${(err as Error)?.message ?? err}`);
      });
  }
}
