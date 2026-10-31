import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { APP_CLOCK, Clock, systemClock } from '../../clock/clock';
import { DobDecryptError } from '../../crypto/dob-crypto';
import { DobEncryptionService } from '../../crypto/dob-encryption.service';
import { PasswordService } from '../auth/password/password.service';
import { generateBackupCodes, looksLikeBackupCode, normaliseBackupCode } from './backup-code.util';
import { TwoFactorAttemptLimiter } from './two-factor-attempt.limiter';
import { TwoFactorPendingStore } from './two-factor-pending.store';
import { PeekedToken, TwoFactorTokenKind, TwoFactorTokenPurpose, TwoFactorTokenStore } from './two-factor-token.store';
import {
  ADMIN_2FA_ENFORCED_ENV,
  BACKUP_CODE_COUNT,
  ENROLMENT_TTL_SECONDS,
  INVALID_CHALLENGE_MESSAGE,
  INVALID_CODE_MESSAGE,
  LOGIN_CHALLENGE_TTL_SECONDS,
  TWO_FACTOR_ALREADY_ENABLED_CODE,
  TWO_FACTOR_NOT_ENABLED_CODE,
  TWO_FACTOR_NO_PENDING_ENROLMENT_CODE,
  TwoFactorAudience,
} from './two-factor.constants';
import {
  AdminTwoFactorRepository,
  TransactionClient,
  TwoFactorRepository,
  TwoFactorSubject,
  UserTwoFactorRepository,
} from './two-factor.repository';
import { buildOtpauthUri, generateTotpSecret, verifyTotp } from './totp.util';

export interface TwoFactorStatus {
  enabled: boolean;
  backupCodesRemaining: number;
}

export interface EnrolmentStart {
  // The manual key an authenticator app accepts when it cannot scan.
  secret: string;
  // otpauth://totp/Soccernity:<email>?...; the frontend draws the QR code.
  otpauthUri: string;
}

export interface TwoFactorChallenge {
  twoFactorRequired: true;
  challengeToken: string;
  challengeExpiresInSeconds: number;
}

export interface AdminEnrolmentRequired {
  twoFactorEnrolmentRequired: true;
  enrolmentToken: string;
  expiresInSeconds: number;
}

export interface CompletedChallenge {
  subjectId: string;
  persistent: boolean;
  purpose: TwoFactorTokenPurpose;
}

const challengeKind = (aud: TwoFactorAudience): TwoFactorTokenKind => (aud === 'user' ? 'user-login' : 'admin-login');

// backend/b086-two-factor (B-086, B-270). The shared brain of authenticator-app two-factor for BOTH auth domains. It is
// written once against TwoFactorRepository; the `audience` argument picks the repository (User + UserBackupCode, or
// AdminUser + AdminBackupCode) and the Redis namespace, so the domains share logic but never rows, tokens or keys.
// Full design and the list of defaults: ./README.md.
@Injectable()
export class TwoFactorService implements OnModuleInit {
  private readonly logger = new Logger(TwoFactorService.name);
  // Padding for the backup-code check (see checkCode). Hashed once at start-up, like AdminAuthService's
  // dummyPasswordHash; its result is never used.
  private dummyBackupCodeHash: string | null = null;

  constructor(
    private readonly users: UserTwoFactorRepository,
    private readonly admins: AdminTwoFactorRepository,
    private readonly dob: DobEncryptionService,
    private readonly passwordService: PasswordService,
    private readonly tokens: TwoFactorTokenStore,
    private readonly pending: TwoFactorPendingStore,
    private readonly limiter: TwoFactorAttemptLimiter,
    private readonly config: ConfigService,
    // The TOTP step is a function of the time, so it is read through the app clock (like the Contest services do):
    // the e2e suite overrides APP_CLOCK to step through codes deterministically. The system clock otherwise.
    @Optional() @Inject(APP_CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  async onModuleInit(): Promise<void> {
    // The warning is logged before the (async) hash so it is emitted synchronously on the call.
    if (!this.isAdminEnforced()) {
      this.logger.warn(
        `${ADMIN_2FA_ENFORCED_ENV} is not "true": admins can sign in with a password alone. ` +
          'It must be "true" in production (launch-gate check, B-267).',
      );
    }
    this.dummyBackupCodeHash = await this.passwordService.hash(randomBytes(32).toString('hex'));
  }

  // Only the literal string "true" turns it on (a typo such as "TRUE" or "1" leaves it off, and the boot warning
  // above says so). Read on every call, not cached, so a restart is the only thing that changes it in production.
  isAdminEnforced(): boolean {
    // The name is a literal on purpose: src/env-completeness.spec.ts finds variables by static pattern.
    return this.config.get<string>('ADMIN_2FA_ENFORCED') === 'true';
  }

  private repo(aud: TwoFactorAudience): TwoFactorRepository {
    return aud === 'user' ? this.users : this.admins;
  }

  // -----------------------------------------------------------------
  // Settings (signed-in account)
  // -----------------------------------------------------------------

  async getStatus(aud: TwoFactorAudience, id: string): Promise<TwoFactorStatus> {
    const subject = await this.requireSubject(aud, id);
    const enabled = subject.totpEnabledAt !== null;
    return { enabled, backupCodesRemaining: enabled ? await this.repo(aud).countUnusedBackupCodes(id) : 0 };
  }

  // Generates a fresh secret and parks it, encrypted, in Redis for 10 minutes. Nothing is written to the account
  // until the first valid code confirms it. Starting again replaces the pending secret.
  async startEnrolment(aud: TwoFactorAudience, id: string): Promise<EnrolmentStart> {
    const subject = await this.requireSubject(aud, id);
    if (subject.totpEnabledAt) throw this.alreadyEnabled();
    const secret = generateTotpSecret();
    await this.pending.put(aud, id, this.dob.encryptString(secret));
    return { secret, otpauthUri: buildOtpauthUri(secret, subject.email) };
  }

  // Confirms enrolment with the first valid code and returns the 10 backup codes, ONCE (only their hashes are kept).
  async confirmEnrolment(aud: TwoFactorAudience, id: string, code: string): Promise<string[]> {
    const subject = await this.requireSubject(aud, id);
    if (subject.totpEnabledAt) throw this.alreadyEnabled();

    const pendingCiphertext = await this.pending.get(aud, id);
    // Key rotation (docs/dob-encryption-rollback.md): a pending secret (10-minute TTL, never re-encrypted by the
    // rotation script) written under a key this process no longer holds cannot be read. That is an enrolment that
    // did not survive, exactly like an expired one: the person starts enrolment again. It must not be a 500, and it
    // is checked BEFORE the attempt limiter reserves a slot, so it costs no failed attempt.
    let pendingSecret: string | null = null;
    if (pendingCiphertext) {
      try {
        pendingSecret = this.dob.decryptString(pendingCiphertext);
      } catch (err) {
        if (!(err instanceof DobDecryptError)) throw err;
        await this.pending.clear(aud, id);
        this.logger.warn('A pending two-factor enrolment could not be decrypted (key changed?); treated as expired.');
      }
    }
    if (pendingSecret === null || !pendingCiphertext) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: TWO_FACTOR_NO_PENDING_ENROLMENT_CODE,
        message: 'Start enrolment first, or it has expired.',
      });
    }

    const reserved = await this.limiter.reserve(aud, id);
    const step = verifyTotp(pendingSecret, normaliseBackupCode(String(code ?? '')), this.clock.now().getTime());
    if (step === null) {
      await this.limiter.recordFailure(aud, id, reserved);
      throw new UnauthorizedException(INVALID_CODE_MESSAGE);
    }

    const codes = generateBackupCodes();
    const hashes = await Promise.all(codes.map((c) => this.passwordService.hash(c)));
    // The pending ciphertext is already encrypted under the right key, so it is stored as is. totpLastUsedStep is
    // set to the confirming step, so this very code cannot be replayed to sign in a moment later.
    const enabled = await this.repo(aud).enable(id, pendingCiphertext, step, hashes);
    if (!enabled) throw this.alreadyEnabled();

    await this.pending.clear(aud, id);
    await this.limiter.clear(aud, id);
    return codes;
  }

  // Replaces ALL backup codes (the old ones stop working). Needs the password.
  async regenerateBackupCodes(aud: TwoFactorAudience, id: string, password: string): Promise<string[]> {
    const subject = await this.requireEnabled(aud, id);
    await this.assertPassword(subject, password);
    const codes = generateBackupCodes();
    const hashes = await Promise.all(codes.map((c) => this.passwordService.hash(c)));
    await this.repo(aud).replaceBackupCodes(id, hashes);
    return codes;
  }

  // Turns two-factor off: the secret fields are cleared and every backup code is deleted. Needs the password. Other
  // sessions are NOT ended (adopted default, veto-able).
  async disable(aud: TwoFactorAudience, id: string, password: string): Promise<void> {
    const subject = await this.requireEnabled(aud, id);
    await this.assertPassword(subject, password);
    await this.repo(aud).disable(id);
    await this.pending.clear(aud, id);
    await this.limiter.clear(aud, id);
  }

  // Used by the admin peer reset (AdminStaffRolesService): clears the target's secret fields and backup codes, with
  // `extra` (the audit-log row) written in the SAME transaction. Returns false if two-factor was not enabled.
  async resetAdmin(adminId: string, extra: (tx: TransactionClient) => Promise<void>): Promise<boolean> {
    const subject = await this.admins.find(adminId);
    if (!subject || !subject.totpEnabledAt) return false;
    await this.admins.disable(adminId, extra);
    await this.pending.clear('admin', adminId);
    await this.limiter.clear('admin', adminId);
    return true;
  }

  // -----------------------------------------------------------------
  // Sign-in
  // -----------------------------------------------------------------

  async issueChallenge(
    aud: TwoFactorAudience,
    subjectId: string,
    persistent: boolean,
    purpose: TwoFactorTokenPurpose = 'login',
  ): Promise<TwoFactorChallenge> {
    const issued = await this.tokens.issue(challengeKind(aud), subjectId, LOGIN_CHALLENGE_TTL_SECONDS, {
      persistent,
      purpose,
    });
    return { twoFactorRequired: true, challengeToken: issued.token, challengeExpiresInSeconds: issued.expiresInSeconds };
  }

  // Second step of sign-in. Everything wrong about the challenge itself (malformed, expired, wrong audience, the
  // account deactivated or suspended or reset in between) is the SAME generic 401. A wrong code is the other 401;
  // a locked account is a 429. The challenge is consumed only on success.
  async completeChallenge(aud: TwoFactorAudience, rawToken: unknown, code: string): Promise<CompletedChallenge> {
    const kind = challengeKind(aud);
    const peeked = await this.tokens.peek(kind, rawToken);
    if (!peeked) throw new UnauthorizedException(INVALID_CHALLENGE_MESSAGE);

    const subject = await this.repo(aud).find(peeked.subjectId);
    // A reactivation challenge is for a deactivated account (it is flipped back to active by the caller after this
    // returns); an ordinary sign-in is only for an active one. Anything else is the generic 401, re-checked HERE
    // because the account may have changed since the password step.
    const allowed = peeked.purpose === 'reactivate' ? ['active', 'deactivated'] : ['active'];
    if (!subject || !subject.totpEnabledAt || !allowed.includes(subject.accountStatus)) {
      throw new UnauthorizedException(INVALID_CHALLENGE_MESSAGE);
    }

    await this.assertCodeAccepted(aud, subject, code);

    if (!(await this.tokens.consume(kind, peeked.id))) throw new UnauthorizedException(INVALID_CHALLENGE_MESSAGE);
    return { subjectId: subject.id, persistent: peeked.persistent, purpose: peeked.purpose };
  }

  // -----------------------------------------------------------------
  // Admin enrolment at sign-in (ADMIN_2FA_ENFORCED = "true", admin has no two-factor yet)
  // -----------------------------------------------------------------

  async issueAdminEnrolmentToken(adminId: string, persistent: boolean): Promise<AdminEnrolmentRequired> {
    const issued = await this.tokens.issue('admin-enrol', adminId, ENROLMENT_TTL_SECONDS, { persistent });
    return { twoFactorEnrolmentRequired: true, enrolmentToken: issued.token, expiresInSeconds: issued.expiresInSeconds };
  }

  async startAdminEnrolmentWithToken(rawToken: unknown): Promise<EnrolmentStart> {
    const { subject } = await this.resolveEnrolmentToken(rawToken);
    return this.startEnrolment('admin', subject.id);
  }

  async confirmAdminEnrolmentWithToken(
    rawToken: unknown,
    code: string,
  ): Promise<{ adminId: string; persistent: boolean; backupCodes: string[] }> {
    const { peeked, subject } = await this.resolveEnrolmentToken(rawToken);
    const backupCodes = await this.confirmEnrolment('admin', subject.id, code);
    // Spent on success only. If a concurrent request already removed it, the account is enrolled either way (the
    // transaction above has exactly one winner), so the result is not checked.
    await this.tokens.consume('admin-enrol', peeked.id);
    return { adminId: subject.id, persistent: peeked.persistent, backupCodes };
  }

  private async resolveEnrolmentToken(rawToken: unknown): Promise<{ peeked: PeekedToken; subject: TwoFactorSubject }> {
    const peeked = await this.tokens.peek('admin-enrol', rawToken);
    if (!peeked) throw new UnauthorizedException(INVALID_CHALLENGE_MESSAGE);
    const subject = await this.admins.find(peeked.subjectId);
    if (!subject || subject.accountStatus !== 'active') throw new UnauthorizedException(INVALID_CHALLENGE_MESSAGE);
    if (subject.totpEnabledAt) throw this.alreadyEnabled();
    return { peeked, subject };
  }

  // -----------------------------------------------------------------
  // Code checking
  // -----------------------------------------------------------------

  // Reserve an attempt, check, and either clear the streak (success) or record the failure. A locked account throws
  // the 429 from reserve() before any code is looked at.
  private async assertCodeAccepted(aud: TwoFactorAudience, subject: TwoFactorSubject, code: unknown): Promise<void> {
    const reserved = await this.limiter.reserve(aud, subject.id);
    const accepted = await this.checkCode(aud, subject, typeof code === 'string' ? code : '');
    if (!accepted) {
      await this.limiter.recordFailure(aud, subject.id, reserved);
      throw new UnauthorizedException(INVALID_CODE_MESSAGE);
    }
    await this.limiter.clear(aud, subject.id);
  }

  // A 6-digit code is a TOTP code; a 10-character code from the backup alphabet is a backup code; anything else
  // fails without further work. Wrong, replayed and already-spent all return false -> the same message.
  private async checkCode(aud: TwoFactorAudience, subject: TwoFactorSubject, rawCode: string): Promise<boolean> {
    const repo = this.repo(aud);
    const normalised = normaliseBackupCode(rawCode.trim());

    if (/^\d{6}$/.test(normalised)) {
      if (!subject.totpSecretEncrypted) return false;
      const step = verifyTotp(this.dob.decryptString(subject.totpSecretEncrypted), normalised, this.clock.now().getTime());
      // advanceStep is the replay guard: it accepts a step only if it is higher than the last accepted one.
      return step !== null && (await repo.advanceStep(subject.id, step));
    }

    if (looksLikeBackupCode(normalised)) {
      const unused = await repo.unusedBackupCodes(subject.id);
      // Compared against EVERY unused code, no early exit, and padded with dummy verifications up to
      // BACKUP_CODE_COUNT, so the work is the same whether the account has ten unused codes or none: how long this
      // takes says neither which code matched nor how many are left. The dummy results are dropped without being
      // read, so a dummy can never be what accepts a code.
      const padding = Math.max(0, BACKUP_CODE_COUNT - unused.length);
      const dummy = this.dummyBackupCodeHash;
      const [results] = await Promise.all([
        Promise.all(unused.map((c) => this.passwordService.verify(c.codeHash, normalised))),
        Promise.all(
          Array.from({ length: padding }, () =>
            dummy === null ? Promise.resolve(false) : this.passwordService.verify(dummy, normalised),
          ),
        ),
      ]);
      const index = results.indexOf(true);
      if (index === -1) return false;
      // updateMany guarded on usedAt IS NULL: a code cannot be spent twice by two simultaneous requests.
      return repo.spendBackupCode(unused[index].id);
    }

    return false;
  }

  // -----------------------------------------------------------------
  // helpers
  // -----------------------------------------------------------------

  private async requireSubject(aud: TwoFactorAudience, id: string): Promise<TwoFactorSubject> {
    const subject = await this.repo(aud).find(id);
    // A valid token for an account that no longer exists (the same rare case JwtAuthGuard's comment describes).
    if (!subject) throw new UnauthorizedException('Invalid credentials');
    return subject;
  }

  private async requireEnabled(aud: TwoFactorAudience, id: string): Promise<TwoFactorSubject> {
    const subject = await this.requireSubject(aud, id);
    if (!subject.totpEnabledAt) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: TWO_FACTOR_NOT_ENABLED_CODE,
        message: 'Two-factor authentication is not turned on.',
      });
    }
    return subject;
  }

  private async assertPassword(subject: TwoFactorSubject, password: string): Promise<void> {
    if (!(await this.passwordService.verify(subject.passwordHash, password))) {
      throw new UnauthorizedException('Incorrect password');
    }
  }

  private alreadyEnabled(): ConflictException {
    return new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      code: TWO_FACTOR_ALREADY_ENABLED_CODE,
      message: 'Two-factor authentication is already turned on.',
    });
  }
}
