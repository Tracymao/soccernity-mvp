import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { APP_CLOCK, Clock, systemClock } from '../../../clock/clock';
import { TwoFactorRecoveryService } from './two-factor-recovery.service';

export interface RecoverySweepResult {
  // Adult waits that ran out: two-factor removed, sessions ended, completion notice sent.
  completed: string[];
  // Waits dropped without removing anything because the account closed or two-factor was already off.
  cancelled: string[];
  // Old request rows deleted (ended 30+ days ago, or never-used links expired 30+ days ago).
  deleted: number;
}

// backend/b276-two-factor-recovery (B-276; Decision Log #455). Hourly, like the other lifecycle sweeps, so an adult's
// 24-hour wait ends within an hour of executeAt. Does two things:
//   1. completes every confirmed request whose executeAt has passed (TwoFactorRecoveryService.completeDue);
//   2. deletes finished / cancelled / declined / superseded request rows 30 days after doneAt, and never-used links 30
//      days after they expired.
// `now` is a parameter so tests can step across the 24 hours and the 30 days without mocking global time; the cron
// entry reads the app clock (APP_CLOCK).
@Injectable()
export class TwoFactorRecoverySweepService {
  private readonly logger = new Logger(TwoFactorRecoverySweepService.name);

  constructor(
    private readonly recovery: TwoFactorRecoveryService,
    @Optional() @Inject(APP_CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runHourlySweep(): Promise<void> {
    const result = await this.sweep(this.clock.now());
    // Logged unconditionally: a sweep that logs nothing is indistinguishable from one that never ran. Counts only.
    this.logger.log(
      `Two-factor recovery sweep complete: completed=${result.completed.length} cancelled=${result.cancelled.length} deleted=${result.deleted}`,
    );
  }

  async sweep(now: Date = this.clock.now()): Promise<RecoverySweepResult> {
    const { completed, cancelled } = await this.recovery.completeDue(now);
    const deleted = await this.recovery.deleteOld(now);
    return { completed, cancelled, deleted };
  }
}
