import { BadRequestException, Logger } from '@nestjs/common';
import { buildTestDobEncryption } from '../../../crypto/test-dob-encryption';
import { GuardianConsentSummaryService, SUMMARY_REJECTION_MESSAGE } from './guardian-consent-summary.service';

const FUTURE = new Date(Date.now() + 60 * 60 * 1000);
const PAST = new Date(Date.now() - 60 * 60 * 1000);

function build(row: unknown) {
  const dob = buildTestDobEncryption();
  const prisma = { guardian: { findUnique: jest.fn().mockResolvedValue(row) } };
  const svc = new GuardianConsentSummaryService(prisma as any, dob);
  return { svc, prisma, dob };
}

function liveRow(dob: ReturnType<typeof buildTestDobEncryption>, over: Record<string, unknown> = {}, minor: Record<string, unknown> = {}) {
  return {
    name: 'Grace Parent',
    relationship: 'Parent',
    consentStatus: 'pending',
    consentTokenExpiresAt: FUTURE,
    minorUser: {
      displayName: 'Ada Minor',
      dateOfBirth: dob.encrypt(new Date('2015-03-09T00:00:00Z')),
      isMinor: true,
      accountStatus: 'active',
      createdAt: new Date('2026-10-01T09:30:00Z'),
      ...minor,
    },
    ...over,
  };
}

describe('GuardianConsentSummaryService (B-021, Decision Log #372)', () => {
  it('returns the request summary for a live, pending, unexpired request', async () => {
    const dob = buildTestDobEncryption();
    const { svc } = build(liveRow(dob));
    await expect(svc.getSummary('tok')).resolves.toEqual({
      minorName: 'Ada Minor',
      dateOfBirth: '2015-03-09',
      guardianName: 'Grace Parent',
      guardianRelationship: 'Parent',
      requestedAt: '2026-10-01T09:30:00.000Z',
      expiresAt: FUTURE.toISOString(), // K5 / B-185: the footnote's "This link expires on {date}"
      incorrectDetailsReported: false,
      notices: { guardianEmailShownOnMinorProfile: true, photoAndUsernameVisibleToOthers: true },
    });
  });

  // B-029: lets the page show "approval is on hold" instead of a button that
  // will be refused. A boolean only -- nothing about WHAT was reported.
  it('reports an open incorrect-details flag as a boolean, and nothing more', async () => {
    const dob = buildTestDobEncryption();
    const { svc } = build(liveRow(dob, { incorrectDetailsReportedAt: new Date('2026-10-02T00:00:00Z') }));
    const summary = await svc.getSummary('tok');
    expect(summary.incorrectDetailsReported).toBe(true);
    expect(JSON.stringify(summary)).not.toContain('2026-10-02');
  });

  it('reads the flag column in the same query (no second lookup)', async () => {
    const dob = buildTestDobEncryption();
    const { svc, prisma } = build(liveRow(dob));
    await svc.getSummary('tok');
    expect(prisma.guardian.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.guardian.findUnique.mock.calls[0][0].select.incorrectDetailsReportedAt).toBe(true);
  });

  it('looks the request up by the token alone, selecting no guardian email or token back out', async () => {
    const dob = buildTestDobEncryption();
    const { svc, prisma } = build(liveRow(dob));
    await svc.getSummary('  tok  ');
    const arg = prisma.guardian.findUnique.mock.calls[0][0];
    expect(arg.where).toEqual({ consentToken: 'tok' });
    expect(arg.select).not.toHaveProperty('email');
    expect(arg.select).not.toHaveProperty('consentToken');
  });

  it('does not leak the ciphertext, the guardian email or the token in the response', async () => {
    const dob = buildTestDobEncryption();
    const row = liveRow(dob);
    const { svc } = build(row);
    const json = JSON.stringify(await svc.getSummary('tok'));
    expect(json).not.toContain(row.minorUser.dateOfBirth as string);
    expect(json).not.toMatch(/consentToken|"email"/);
  });

  // The whole point of the endpoint's shape: one indistinguishable rejection.
  describe.each([
    ['an unknown / rotated token', () => null],
    ['an expired token', (dob: any) => liveRow(dob, { consentTokenExpiresAt: PAST })],
    ['a used (confirmed) request', (dob: any) => liveRow(dob, { consentStatus: 'confirmed' })],
    ['a declined / withdrawn request', (dob: any) => liveRow(dob, { consentStatus: 'declined' })],
    ['an account no longer active', (dob: any) => liveRow(dob, {}, { accountStatus: 'pending_deletion' })],
    ['an account that is no longer a minor', (dob: any) => liveRow(dob, {}, { isMinor: false })],
    ['an anonymised account with no date of birth', (dob: any) => liveRow(dob, {}, { dateOfBirth: null })],
  ])('rejects %s', (_label, make) => {
    it('with the single generic 400, never a distinguishing message', async () => {
      const dob = buildTestDobEncryption();
      const { svc } = build((make as any)(dob));
      const err = await svc.getSummary('tok').catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.getResponse()).toEqual({
        statusCode: 400,
        message: SUMMARY_REJECTION_MESSAGE,
        error: 'Bad Request',
      });
    });
  });

  it.each([[undefined], [''], ['   '], ['x'.repeat(201)]])('rejects a missing / blank / oversized token (%p) without a database read', async (token) => {
    const dob = buildTestDobEncryption();
    const { svc, prisma } = build(liveRow(dob));
    await expect(svc.getSummary(token as string | undefined)).rejects.toThrow(SUMMARY_REJECTION_MESSAGE);
    expect(prisma.guardian.findUnique).not.toHaveBeenCalled();
  });

  it('a date of birth that cannot be decrypted gets the same rejection, and logs only a fixed message', async () => {
    const dob = buildTestDobEncryption();
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { svc } = build(liveRow(dob, {}, { dateOfBirth: 'v1:garbage:garbage:garbage' }));
    await expect(svc.getSummary('secret-token-value')).rejects.toThrow(SUMMARY_REJECTION_MESSAGE);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('secret-token-value');
    errorSpy.mockRestore();
  });

  it('logs nothing at all on success or an ordinary rejection', async () => {
    const dob = buildTestDobEncryption();
    const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map((l) =>
      jest.spyOn(Logger.prototype, l).mockImplementation(() => undefined),
    );
    await build(liveRow(dob)).svc.getSummary('tok');
    await build(null).svc.getSummary('tok').catch(() => undefined);
    spies.forEach((s) => expect(s).not.toHaveBeenCalled());
    spies.forEach((s) => s.mockRestore());
  });
});
