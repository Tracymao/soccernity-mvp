import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagingService } from './messaging.service';

// B-061 (Decision Log #472 (i), the 'Who can message me' setting). The setting is applied AFTER every
// existing rule has decided, so it can only TIGHTEN them. 'following' = the RECIPIENT follows the caller.
// A refusal is the SAME 404 'User not found' every other not-messageable recipient gets, from the SAME
// fixed set of reads (#350). Mocked Prisma; the real read/constraint behaviour is in
// test/dm-permission-media-sensitive.e2e-spec.ts.

function buildPrismaMock() {
  const prisma = {
    conversation: {
      create: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    message: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
    user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    guardian: { findUnique: jest.fn() },
    block: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    follow: { findMany: jest.fn(), findFirst: jest.fn() },
  } as unknown as PrismaService;
  return prisma;
}

const CALLER = 'caller-1';
const RECIPIENT = 'recipient-2';

const convoRow = {
  id: 'convo-1',
  participantIds: [CALLER, RECIPIENT].sort(),
  lastMessageAt: new Date('2026-11-16T10:00:00Z'),
  createdAt: new Date('2026-11-16T09:00:00Z'),
};

type Row = Record<string, unknown>;

function recipientRow(over: Row = {}): Row {
  return {
    id: RECIPIENT,
    isMinor: false,
    isUnder16: false,
    accountStatus: 'active',
    guardian: null,
    dmPermission: 'everyone',
    following: [],
    ...over,
  };
}

function callerRow(over: Row = {}): Row {
  return { id: CALLER, isMinor: false, isUnder16: false, accountStatus: 'active', guardian: null, dmPermission: 'everyone', following: [], ...over };
}

describe('MessagingService.startConversation: dmPermission (B-061)', () => {
  let prisma: PrismaService;
  let service: MessagingService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = () => prisma as any;

  function arrange(recipient: Row | null, caller: Row = callerRow()) {
    p().user.findMany.mockResolvedValue(recipient ? [caller, recipient] : [caller]);
    p().conversation.create.mockResolvedValue(convoRow);
  }
  const FOLLOWS_CALLER = [{ id: 'follow-1' }];

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new MessagingService(prisma);
  });

  describe('the read', () => {
    it('folds the setting and the recipient-follows-caller check into the ONE existing user.findMany', async () => {
      arrange(recipientRow());
      await service.startConversation(CALLER, RECIPIENT);
      // The decision read is the FIRST user.findMany (a successful create then reads the other
      // participant's name for the response view, which is the pre-existing second call).
      expect(p().user.findMany.mock.calls[0][0]).toEqual({
        where: { id: { in: [CALLER, RECIPIENT] } },
        select: expect.objectContaining({
          dmPermission: true,
          following: { where: { followeeId: CALLER }, select: { id: true }, take: 1 },
        }),
      });
      // No extra table is read for it.
      expect(p().follow.findMany).not.toHaveBeenCalled();
      expect(p().follow.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("'everyone' (the default)", () => {
    it('allows a new conversation whether or not the recipient follows the caller', async () => {
      arrange(recipientRow({ dmPermission: 'everyone', following: [] }));
      await expect(service.startConversation(CALLER, RECIPIENT)).resolves.toMatchObject({ created: true });
      arrange(recipientRow({ dmPermission: 'everyone', following: FOLLOWS_CALLER }));
      await expect(service.startConversation(CALLER, RECIPIENT)).resolves.toMatchObject({ created: true });
    });

    it('a row with no dmPermission value at all behaves as everyone (rows read before the column existed)', async () => {
      const row = recipientRow();
      delete row.dmPermission;
      delete row.following;
      arrange(row);
      await expect(service.startConversation(CALLER, RECIPIENT)).resolves.toMatchObject({ created: true });
    });
  });

  describe("'following' (recipient follows the sender)", () => {
    it('allows a caller the recipient follows', async () => {
      arrange(recipientRow({ dmPermission: 'following', following: FOLLOWS_CALLER }));
      await expect(service.startConversation(CALLER, RECIPIENT)).resolves.toMatchObject({ created: true });
    });

    it('refuses a caller the recipient does NOT follow, with the same 404 a missing recipient gets', async () => {
      arrange(recipientRow({ dmPermission: 'following', following: [] }));
      const refused = await service.startConversation(CALLER, RECIPIENT).catch((e) => e);
      arrange(null);
      const missing = await service.startConversation(CALLER, RECIPIENT).catch((e) => e);
      expect(refused).toBeInstanceOf(NotFoundException);
      expect(refused.getStatus()).toBe(missing.getStatus());
      expect(refused.getResponse()).toEqual(missing.getResponse());
    });

    it('is directional: the CALLER following the recipient does not count (it is the recipient who must follow)', async () => {
      // The caller row carries a follow entry; the recipient row has none.
      arrange(recipientRow({ dmPermission: 'following', following: [] }), callerRow({ following: FOLLOWS_CALLER }));
      await expect(service.startConversation(CALLER, RECIPIENT)).rejects.toBeInstanceOf(NotFoundException);
      expect(p().conversation.create).not.toHaveBeenCalled();
    });
  });

  describe("'none'", () => {
    it('refuses everyone, even a caller the recipient follows', async () => {
      arrange(recipientRow({ dmPermission: 'none', following: FOLLOWS_CALLER }));
      await expect(service.startConversation(CALLER, RECIPIENT)).rejects.toBeInstanceOf(NotFoundException);
      expect(p().conversation.create).not.toHaveBeenCalled();
    });
  });

  it('an unrecognised stored value fails CLOSED (treated as none)', async () => {
    arrange(recipientRow({ dmPermission: 'mystery', following: FOLLOWS_CALLER }));
    await expect(service.startConversation(CALLER, RECIPIENT)).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('existing threads keep working (the setting governs STARTING only; DEFAULT, founder-veto-able)', () => {
    it.each(['following', 'none'])("an existing thread is returned (200, created: false) even when the recipient's setting is '%s'", async (perm) => {
      arrange(recipientRow({ dmPermission: perm, following: [] }));
      p().conversation.findUnique.mockResolvedValue(convoRow);
      const result = await service.startConversation(CALLER, RECIPIENT);
      expect(result.created).toBe(false);
      expect(p().conversation.create).not.toHaveBeenCalled();
    });
  });

  describe('it can only TIGHTEN: every existing rule still decides first', () => {
    it("'everyone' never lets through an under-16 recipient (#346)", async () => {
      arrange(recipientRow({ dmPermission: 'everyone', isUnder16: true, isMinor: true, guardian: { consentStatus: 'confirmed' } }));
      await expect(service.startConversation(CALLER, RECIPIENT)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("'following' with a follow still does not let an adult start a conversation with a minor (#347)", async () => {
      arrange(
        recipientRow({ dmPermission: 'following', following: FOLLOWS_CALLER, isMinor: true, guardian: { consentStatus: 'confirmed' } }),
        callerRow({ isMinor: false }),
      );
      await expect(service.startConversation(CALLER, RECIPIENT)).rejects.toBeInstanceOf(NotFoundException);
      expect(p().conversation.create).not.toHaveBeenCalled();
    });

    it("'following' with a follow still does not reach a restricted-pending minor (#12)", async () => {
      arrange(recipientRow({ dmPermission: 'following', following: FOLLOWS_CALLER, isMinor: true, guardian: { consentStatus: 'pending' } }));
      await expect(service.startConversation(CALLER, RECIPIENT)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("'following' with a follow still does not reach a deactivated recipient (#221)", async () => {
      arrange(recipientRow({ dmPermission: 'following', following: FOLLOWS_CALLER, accountStatus: 'deactivated' }));
      await expect(service.startConversation(CALLER, RECIPIENT)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("'following' with a follow does not get past a Block: the blocker still gets the explicit 403", async () => {
      arrange(recipientRow({ dmPermission: 'following', following: FOLLOWS_CALLER }));
      p().block.findMany.mockResolvedValue([{ blockerId: CALLER, blockedId: RECIPIENT }]);
      await expect(service.startConversation(CALLER, RECIPIENT)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("'following' with a follow does not get past a Block by the recipient: the same indistinguishable 404", async () => {
      arrange(recipientRow({ dmPermission: 'following', following: FOLLOWS_CALLER }));
      p().block.findMany.mockResolvedValue([{ blockerId: RECIPIENT, blockedId: CALLER }]);
      await expect(service.startConversation(CALLER, RECIPIENT)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('minor -> adult and minor -> minor are still allowed under everyone, and still subject to the setting', async () => {
      arrange(recipientRow({ isMinor: false, dmPermission: 'none' }), callerRow({ isMinor: true }));
      await expect(service.startConversation(CALLER, RECIPIENT)).rejects.toBeInstanceOf(NotFoundException);
      arrange(recipientRow({ isMinor: false, dmPermission: 'everyone' }), callerRow({ isMinor: true }));
      await expect(service.startConversation(CALLER, RECIPIENT)).resolves.toMatchObject({ created: true });
    });
  });

  // sprint-1/dm-enumeration-timing-parity (#350): the DM-permission refusal must cost exactly the same
  // database work as every other 404, so it cannot be told apart by timing.
  it('does identical database work for a dmPermission refusal and every other 404 outcome', async () => {
    const scenarios: Array<[string, () => void]> = [
      ['missing recipient', () => arrange(null)],
      ['deactivated recipient', () => arrange(recipientRow({ accountStatus: 'deactivated' }))],
      ["dmPermission 'none'", () => arrange(recipientRow({ dmPermission: 'none' }))],
      ["dmPermission 'following', no follow", () => arrange(recipientRow({ dmPermission: 'following', following: [] }))],
    ];
    const fingerprints: string[] = [];
    for (const [name, setup] of scenarios) {
      prisma = buildPrismaMock();
      service = new MessagingService(prisma);
      setup();
      await expect(service.startConversation(CALLER, RECIPIENT)).rejects.toBeInstanceOf(NotFoundException);
      expect([name, p().user.findMany.mock.calls.length]).toEqual([name, 1]);
      expect([name, p().user.findUnique.mock.calls.length]).toEqual([name, 0]);
      expect([name, p().conversation.findUnique.mock.calls.length]).toEqual([name, 1]);
      expect([name, p().block.findMany.mock.calls.length]).toEqual([name, 1]);
      expect([name, p().follow.findMany.mock.calls.length]).toEqual([name, 0]);
      fingerprints.push(
        JSON.stringify([p().user.findMany.mock.calls, p().conversation.findUnique.mock.calls, p().block.findMany.mock.calls]),
      );
    }
    expect(new Set(fingerprints).size).toBe(1);
  });
});
