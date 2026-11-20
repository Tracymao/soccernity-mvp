import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// What the core service needs to know about the account a code belongs to. Both audiences have all of it.
export interface TwoFactorSubject {
  id: string;
  email: string;
  passwordHash: string;
  accountStatus: string;
  totpSecretEncrypted: string | null;
  totpEnabledAt: Date | null;
  totpLastUsedStep: number | null;
}

export interface BackupCodeRow {
  id: string;
  codeHash: string;
}

// The only place the two auth domains' tables are touched. The core service (two-factor.service.ts) is written
// once against this interface; UserTwoFactorRepository reads and writes User + UserBackupCode and
// AdminTwoFactorRepository reads and writes AdminUser + AdminBackupCode, so no row, query or secret is ever shared
// across the two domains.
export interface TwoFactorRepository {
  find(id: string): Promise<TwoFactorSubject | null>;
  // Turns two-factor on and stores the 10 backup-code hashes (replacing any left over) in ONE transaction. The
  // update is guarded on totpEnabledAt IS NULL, so of two racing confirmations exactly one returns true.
  enable(id: string, secretEncrypted: string, step: number, codeHashes: string[]): Promise<boolean>;
  // Clears the secret fields and deletes every backup code in ONE transaction. `extra` runs inside the same
  // transaction (the admin reset writes its audit row there).
  disable(id: string, extra?: (tx: TransactionClient) => Promise<void>): Promise<void>;
  replaceBackupCodes(id: string, codeHashes: string[]): Promise<void>;
  unusedBackupCodes(id: string): Promise<BackupCodeRow[]>;
  countUnusedBackupCodes(id: string): Promise<number>;
  // Spends one code: true only if it was still unused (updateMany guarded on usedAt IS NULL), so a code cannot be
  // spent twice by two simultaneous requests.
  spendBackupCode(codeId: string): Promise<boolean>;
  // Replay protection: records the accepted step only if it is higher than the last one. Atomic.
  advanceStep(id: string, step: number): Promise<boolean>;
}

// The Prisma transaction client; typed loosely on purpose so the same callback signature serves both repositories.
export type TransactionClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

const SUBJECT_SELECT = {
  id: true,
  email: true,
  passwordHash: true,
  accountStatus: true,
  totpSecretEncrypted: true,
  totpEnabledAt: true,
  totpLastUsedStep: true,
} as const;

const CLEARED = { totpSecretEncrypted: null, totpEnabledAt: null, totpLastUsedStep: null } as const;

@Injectable()
export class UserTwoFactorRepository implements TwoFactorRepository {
  constructor(private readonly prisma: PrismaService) {}

  find(id: string): Promise<TwoFactorSubject | null> {
    return this.prisma.user.findUnique({ where: { id }, select: SUBJECT_SELECT });
  }

  async enable(id: string, secretEncrypted: string, step: number, codeHashes: string[]): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.user.updateMany({
        where: { id, totpEnabledAt: null },
        data: { totpSecretEncrypted: secretEncrypted, totpEnabledAt: new Date(), totpLastUsedStep: step },
      });
      if (count !== 1) return false;
      await tx.userBackupCode.deleteMany({ where: { userId: id } });
      await tx.userBackupCode.createMany({ data: codeHashes.map((codeHash) => ({ userId: id, codeHash })) });
      return true;
    });
  }

  async disable(id: string, extra?: (tx: TransactionClient) => Promise<void>): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: CLEARED });
      await tx.userBackupCode.deleteMany({ where: { userId: id } });
      if (extra) await extra(tx);
    });
  }

  async replaceBackupCodes(id: string, codeHashes: string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.userBackupCode.deleteMany({ where: { userId: id } });
      await tx.userBackupCode.createMany({ data: codeHashes.map((codeHash) => ({ userId: id, codeHash })) });
    });
  }

  unusedBackupCodes(id: string): Promise<BackupCodeRow[]> {
    return this.prisma.userBackupCode.findMany({
      where: { userId: id, usedAt: null },
      select: { id: true, codeHash: true },
    });
  }

  countUnusedBackupCodes(id: string): Promise<number> {
    return this.prisma.userBackupCode.count({ where: { userId: id, usedAt: null } });
  }

  async spendBackupCode(codeId: string): Promise<boolean> {
    const { count } = await this.prisma.userBackupCode.updateMany({
      where: { id: codeId, usedAt: null },
      data: { usedAt: new Date() },
    });
    return count === 1;
  }

  async advanceStep(id: string, step: number): Promise<boolean> {
    const { count } = await this.prisma.user.updateMany({
      where: { id, OR: [{ totpLastUsedStep: null }, { totpLastUsedStep: { lt: step } }] },
      data: { totpLastUsedStep: step },
    });
    return count === 1;
  }
}

@Injectable()
export class AdminTwoFactorRepository implements TwoFactorRepository {
  constructor(private readonly prisma: PrismaService) {}

  find(id: string): Promise<TwoFactorSubject | null> {
    return this.prisma.adminUser.findUnique({ where: { id }, select: SUBJECT_SELECT });
  }

  async enable(id: string, secretEncrypted: string, step: number, codeHashes: string[]): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.adminUser.updateMany({
        where: { id, totpEnabledAt: null },
        data: { totpSecretEncrypted: secretEncrypted, totpEnabledAt: new Date(), totpLastUsedStep: step },
      });
      if (count !== 1) return false;
      await tx.adminBackupCode.deleteMany({ where: { adminId: id } });
      await tx.adminBackupCode.createMany({ data: codeHashes.map((codeHash) => ({ adminId: id, codeHash })) });
      return true;
    });
  }

  async disable(id: string, extra?: (tx: TransactionClient) => Promise<void>): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.adminUser.update({ where: { id }, data: CLEARED });
      await tx.adminBackupCode.deleteMany({ where: { adminId: id } });
      if (extra) await extra(tx);
    });
  }

  async replaceBackupCodes(id: string, codeHashes: string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.adminBackupCode.deleteMany({ where: { adminId: id } });
      await tx.adminBackupCode.createMany({ data: codeHashes.map((codeHash) => ({ adminId: id, codeHash })) });
    });
  }

  unusedBackupCodes(id: string): Promise<BackupCodeRow[]> {
    return this.prisma.adminBackupCode.findMany({
      where: { adminId: id, usedAt: null },
      select: { id: true, codeHash: true },
    });
  }

  countUnusedBackupCodes(id: string): Promise<number> {
    return this.prisma.adminBackupCode.count({ where: { adminId: id, usedAt: null } });
  }

  async spendBackupCode(codeId: string): Promise<boolean> {
    const { count } = await this.prisma.adminBackupCode.updateMany({
      where: { id: codeId, usedAt: null },
      data: { usedAt: new Date() },
    });
    return count === 1;
  }

  async advanceStep(id: string, step: number): Promise<boolean> {
    const { count } = await this.prisma.adminUser.updateMany({
      where: { id, OR: [{ totpLastUsedStep: null }, { totpLastUsedStep: { lt: step } }] },
      data: { totpLastUsedStep: step },
    });
    return count === 1;
  }
}
