import { Prisma } from '@prisma/client';
import {
  ANONYMISER_DELETES_IMPLICIT_M2M,
  ANONYMISER_DELETES_RELATIONS,
  CONTENT_RELATIONS,
  PLAIN_USER_REFERENCES,
  findFirstBlocker,
  unclassifiedRelationKeys,
  userForeignKeyRelations,
  userImplicitManyToManyRelations,
} from './anonymized-row-purge.references';

// backend/w6-purge-anonymised-rows (B-043; Decision Log #375).

const models = Prisma.dmmf.datamodel.models;

/** A transaction client in which every model's findFirst finds nothing and every raw query is empty. */
function emptyTx() {
  const tx: Record<string, unknown> = { $queryRaw: jest.fn().mockResolvedValue([]) };
  for (const m of models) {
    tx[m.name.charAt(0).toLowerCase() + m.name.slice(1)] = { findFirst: jest.fn().mockResolvedValue(null) };
  }
  return tx;
}
const asTx = (tx: Record<string, unknown>) => tx as unknown as Prisma.TransactionClient;

describe('purge reference classification', () => {
  it('every relation FROM a model TO User is classified as content or anonymiser-deletes', () => {
    // If this fails, a model with a relation to User was added. Decide which list it belongs in (see
    // anonymized-row-purge.references.ts); until then the purge treats it as a blocker, which is safe.
    expect(unclassifiedRelationKeys()).toEqual([]);
  });

  it('notices a NEW model with a relation to User that nobody classified', () => {
    const fake = { key: 'BrandNewThing.owner' };
    expect(unclassifiedRelationKeys([...userForeignKeyRelations(), fake])).toEqual(['BrandNewThing.owner']);
  });

  it('the two lists are disjoint and neither names a relation that no longer exists', () => {
    const derived = new Set(userForeignKeyRelations().map((r) => r.key));
    const overlap = CONTENT_RELATIONS.filter((k) => ANONYMISER_DELETES_RELATIONS.includes(k));
    expect(overlap).toEqual([]);
    expect([...CONTENT_RELATIONS, ...ANONYMISER_DELETES_RELATIONS].filter((k) => !derived.has(k))).toEqual([]);
  });

  it('every CASCADE foreign key into User is classified (a DELETE would silently destroy its rows)', () => {
    const cascading = userForeignKeyRelations().filter((r) => {
      const field = models.find((m) => m.name === r.model)?.fields.find((f) => f.name === r.field);
      return field?.relationOnDelete === 'Cascade';
    });
    // The five the register named, plus the two membership tables the anonymiser empties itself.
    expect(cascading.map((r) => r.key).sort()).toEqual(
      [
        'BanterRoomMember.user',
        'CommunityGroup.createdBy',
        'CommunityGroupMember.user',
        'ContestEntry.user',
        'ContestRoundWinner.user',
        'ContestStanding.user',
        'PointsLedgerEntry.user',
      ].sort(),
    );
    expect(unclassifiedRelationKeys(cascading)).toEqual([]);
  });

  it('the implicit many-to-many relations User takes part in are the ones the anonymiser clears', () => {
    expect(userImplicitManyToManyRelations()).toEqual([...ANONYMISER_DELETES_IMPLICIT_M2M].sort());
  });

  it('every scalar column that looks like a plain user reference is classified (new ones fail the build)', () => {
    const fkScalars = new Set(userForeignKeyRelations().map((r) => `${r.model}.${r.fkField}`));
    // Any relation's own FK scalar (to any model) is not a "plain" reference.
    for (const m of models) {
      for (const f of m.fields) {
        if (f.kind === 'object') for (const from of f.relationFromFields ?? []) fkScalars.add(`${m.name}.${from}`);
      }
    }
    const looksLikeUserRef = /^(userId|voterId|viewerId|actorId|minorUserId|createdBy|participantIds|targetId|[a-z]+UserId)$/;
    const found: string[] = [];
    for (const m of models) {
      for (const f of m.fields) {
        if (f.kind === 'scalar' && looksLikeUserRef.test(f.name) && !fkScalars.has(`${m.name}.${f.name}`)) {
          found.push(`${m.name}.${f.name}`);
        }
      }
    }
    expect(found.sort()).toEqual(Object.keys(PLAIN_USER_REFERENCES).sort());
  });
});

describe('findFirstBlocker', () => {
  const userId = 'user-1';

  it('returns null when nothing refers to the user', async () => {
    expect(await findFirstBlocker(asTx(emptyTx()), userId)).toBeNull();
  });

  // One test per model in the derived list: a surviving row there blocks the purge. For the CASCADE
  // foreign keys this is the "no silent cascade" proof at unit level (the e2e proves it against Postgres).
  it.each(userForeignKeyRelations().map((r) => [r.key, r] as const))('%s blocks the purge', async (_key, r) => {
    const tx = emptyTx();
    (tx[r.delegate] as { findFirst: jest.Mock }).findFirst.mockImplementation(async (args: { where: Record<string, string> }) =>
      args.where[r.fkField] === userId ? { [r.fkField]: userId } : null,
    );

    const blocker = await findFirstBlocker(asTx(tx), userId);

    expect(blocker).toEqual({
      label: r.key,
      kind: (CONTENT_RELATIONS as readonly string[]).includes(r.key) ? 'content' : 'anomaly',
    });
    // and it is the FK scalar for THIS user that was looked up, not something broader
    expect((tx[r.delegate] as { findFirst: jest.Mock }).findFirst).toHaveBeenCalledWith({
      where: { [r.fkField]: userId },
      select: { [r.fkField]: true },
    });
  });

  it('a row for a DIFFERENT user does not block', async () => {
    const tx = emptyTx();
    (tx.post as { findFirst: jest.Mock }).findFirst.mockImplementation(async (args: { where: Record<string, string> }) =>
      args.where.authorId === 'someone-else' ? { authorId: 'someone-else' } : null,
    );
    expect(await findFirstBlocker(asTx(tx), userId)).toBeNull();
  });

  it('the implicit club-membership join table blocks as an anomaly', async () => {
    const tx = emptyTx();
    (tx.$queryRaw as jest.Mock).mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join('?').includes('"_ClubMembership"') ? [{ found: 1 }] : [],
    );
    expect(await findFirstBlocker(asTx(tx), userId)).toEqual({ label: '_ClubMembership', kind: 'anomaly' });
  });

  describe('references with no foreign key', () => {
    it('a Report filed against the user (or a post/comment they authored) blocks', async () => {
      const tx = emptyTx();
      (tx.$queryRaw as jest.Mock).mockImplementation(async (strings: TemplateStringsArray) => {
        const sql = strings.join('?');
        if (sql.includes('FROM "Report"')) {
          // the three arms of the report check are all present in the one query
          expect(sql).toContain(`r."targetType" = 'user'`);
          expect(sql).toContain(`r."targetType" = 'post'`);
          expect(sql).toContain(`r."targetType" = 'comment'`);
          return [{ found: 1 }];
        }
        return [];
      });
      expect(await findFirstBlocker(asTx(tx), userId)).toEqual({ label: 'Report.targetId', kind: 'content' });
    });

    it.each([
      ['RevokedUsername.userId', 'revokedUsername', { userId }],
      ['AdminActionLog.targetId', 'adminActionLog', { targetType: 'user', targetId: userId }],
      ['ContestVoteEvent.voterId', 'contestVoteEvent', { voterId: userId }],
      ['AgeReclassificationLog.userId', 'ageReclassificationLog', { userId }],
      ['BanterRoom.createdBy', 'banterRoom', { createdBy: userId }],
      ['Conversation.participantIds', 'conversation', { participantIds: { has: userId } }],
    ])('%s blocks', async (label, delegate, where) => {
      const tx = emptyTx();
      (tx[delegate] as { findFirst: jest.Mock }).findFirst.mockResolvedValue({ id: 'x' });
      expect(await findFirstBlocker(asTx(tx), userId)).toEqual({ label, kind: 'content' });
      expect((tx[delegate] as { findFirst: jest.Mock }).findFirst).toHaveBeenCalledWith({ where, select: { id: true } });
    });

    it('the ConsentAuditRecord snapshot and other users\' Notification.actorId pointers are NOT checked', async () => {
      const tx = emptyTx();
      (tx.consentAuditRecord as { findFirst: jest.Mock }).findFirst.mockResolvedValue({ id: 'c' });
      (tx.notification as { findFirst: jest.Mock }).findFirst.mockImplementation(async (args: { where: Record<string, string> }) =>
        args.where.actorId === userId ? { id: 'n' } : null,
      );
      expect(await findFirstBlocker(asTx(tx), userId)).toBeNull();
      expect((tx.consentAuditRecord as { findFirst: jest.Mock }).findFirst).not.toHaveBeenCalled();
    });
  });
});
