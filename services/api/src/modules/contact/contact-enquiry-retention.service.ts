import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { readContactConfig } from './contact.config';
import { CONTACT_RETENTION_MAX_PER_RUN } from './contact.constants';

export interface PurgeContactEnquiriesResult {
  deletedCount: number;
  /** More due enquiries existed than CONTACT_RETENTION_MAX_PER_RUN; the rest wait for the next run. */
  capped: boolean;
}

// backend/w7-contact-us-enquiry (B-046; Decision Log #440, #444). Deletes Contact Us enquiries whose LAST
// message is older than CONTACT_ENQUIRY_RETENTION_MONTHS (default 12), automatically.
//
// NEVER deletes an escalated enquiry (escalatedReportId set): #444 says that from then on the linked
// report's retention applies and the 12-month deletion no longer does. The escalated test is in the SELECT
// and repeated in the DELETE, so an enquiry escalated between the two is not removed.
//
// Cron discipline copied from AnonymizedRowPurgeService (B-043): daily, 6-field cron, a per-run cap, the
// oldest first, counts only in the log (never an id, name, email or text), `now` injectable for tests.
// 03:45 -- after the 03:00 deletion sweep and the 03:30 anonymised-row purge.
@Injectable()
export class ContactEnquiryRetentionService {
  private readonly logger = new Logger(ContactEnquiryRetentionService.name);
  private readonly retentionMonths: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.retentionMonths = readContactConfig({ get: (k) => config.get<string>(k) }).retentionMonths;
  }

  @Cron('0 45 3 * * *')
  async runDailyPurge(): Promise<void> {
    try {
      const r = await this.purgeExpired();
      this.logger.log(`Contact enquiry retention complete: deleted=${r.deletedCount} capped=${r.capped}`);
    } catch (err) {
      this.logger.error(
        `Contact enquiry retention failed (${err instanceof Error ? err.message : String(err)}); it will run again tomorrow.`,
      );
    }
  }

  // Strictly OLDER than the cutoff: an enquiry whose lastMessageAt is exactly the cutoff instant is kept.
  // Calendar months through setUTCMonth (not a fixed day count, not setMonth, which is DST-sensitive), the
  // same convention as AccountDeletionSweepService.purgeExpiredConsentAuditRecords.
  async purgeExpired(now: Date = new Date()): Promise<PurgeContactEnquiriesResult> {
    const cutoff = new Date(now);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - this.retentionMonths);

    const due = await this.prisma.contactEnquiry.findMany({
      where: { lastMessageAt: { lt: cutoff }, escalatedReportId: null },
      select: { id: true },
      orderBy: [{ lastMessageAt: 'asc' }, { id: 'asc' }],
      take: CONTACT_RETENTION_MAX_PER_RUN + 1,
    });
    const capped = due.length > CONTACT_RETENTION_MAX_PER_RUN;
    if (capped) {
      this.logger.log(
        `Contact enquiry retention: more than ${CONTACT_RETENTION_MAX_PER_RUN} enquiries are due; processing the oldest ${CONTACT_RETENTION_MAX_PER_RUN}, the rest wait for the next run.`,
      );
    }
    const ids = due.slice(0, CONTACT_RETENTION_MAX_PER_RUN).map((d) => d.id);
    if (ids.length === 0) return { deletedCount: 0, capped };

    const result = await this.prisma.contactEnquiry.deleteMany({
      where: { id: { in: ids }, lastMessageAt: { lt: cutoff }, escalatedReportId: null },
    });
    return { deletedCount: result.count, capped };
  }
}
