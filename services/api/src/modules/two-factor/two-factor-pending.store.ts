import { Inject, Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { ENROLMENT_TTL_SECONDS, TwoFactorAudience } from './two-factor.constants';

// A secret that has been generated but not yet confirmed by a first valid code. It lives ONLY here, encrypted (the
// caller passes the DOB_ENCRYPTION_KEY ciphertext, never the plaintext), with a 10-minute TTL; it is written to the
// User / AdminUser row only when the first valid code confirms it. One pending secret per account: starting
// enrolment again replaces it.
export interface TwoFactorPendingRedisClient {
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
}

const pendingKey = (aud: TwoFactorAudience, subjectId: string) => `2fa:pending:${aud}:${subjectId}`;

@Injectable()
export class TwoFactorPendingStore {
  constructor(@Inject(RedisService) private readonly redis: TwoFactorPendingRedisClient) {}

  async put(aud: TwoFactorAudience, subjectId: string, encryptedSecret: string): Promise<void> {
    await this.redis.set(pendingKey(aud, subjectId), encryptedSecret, 'EX', ENROLMENT_TTL_SECONDS);
  }

  async get(aud: TwoFactorAudience, subjectId: string): Promise<string | null> {
    return this.redis.get(pendingKey(aud, subjectId));
  }

  async clear(aud: TwoFactorAudience, subjectId: string): Promise<void> {
    await this.redis.del(pendingKey(aud, subjectId));
  }
}
