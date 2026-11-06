import { DobEncryptionService } from '../../crypto/dob-encryption.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DATA_EXPORT_PAGE_SIZE } from './data-export.constants';
import {
  COMMENT_SELECT,
  FOLLOWING_SELECT,
  MESSAGE_SELECT,
  POST_SELECT,
  PROFILE_SELECT,
  buildDataExportFile,
} from './data-export-file.builder';

// B-060: the file holds the person's own profile, posts, comments, follows and sent messages and NOTHING else.
// These tests are the guard on that: they hand the builder rows that are LOADED with everything that must never be
// exported (even though a correct select would never return it) and fail if any of it reaches the output.

const NOW = new Date('2026-11-18T10:00:00.000Z');
const SECRET_HASH = '$argon2id$v=19$m=65536,t=3,p=4$SECRETHASHVALUE';
const GUARDIAN_EMAIL = 'guardian-secret@example.com';
const TOKEN = 'consent-token-abc123';
const TOTP = 'v1:totp-secret-ciphertext';
const ORIGINAL_TEXT = 'the text before the edit';

// Keys that must never appear anywhere in the output, however deep.
const FORBIDDEN_KEYS = [
  'passwordHash',
  'totpSecretEncrypted',
  'totpEnabledAt',
  'totpLastUsedStep',
  'guardian',
  'guardianEmail',
  'consentToken',
  'withdrawalToken',
  'declaredCountry',
  'derivedCountry',
  'originalContentText',
  'deletedForEveryoneAt',
  'senderId',
  'avatarKey',
  'coverKey',
  'avatarRejectionReason',
  'coverRejectionReason',
];

function collectKeys(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => collectKeys(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      collectKeys(v, out);
    }
  }
  return out;
}

const dob = {
  decryptNullable: jest.fn((v: string | null) => (v === null ? null : new Date('2010-05-04T00:00:00.000Z'))),
} as unknown as DobEncryptionService;

function userRow(over: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'me@example.com',
    phone: '+2348000000000',
    displayName: 'Real Name',
    username: 'myhandle',
    dateOfBirth: 'v1:encrypted-dob',
    isMinor: true,
    isUnder16: true,
    role: 'fan',
    verificationStatus: 'verified',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    bio: 'my bio',
    preferredClub: 'My FC',
    profileCountry: 'NG',
    avatarUrl: 'https://cdn.example/a.jpg',
    avatarStatus: 'approved',
    coverUrl: 'https://cdn.example/c.jpg',
    coverStatus: 'pending',
    isTeamOrganiser: false,
    representedClub: { id: 'club-1', name: 'Club One' },
    // ---- things a mistaken select could drag in; none may reach the file ----
    passwordHash: SECRET_HASH,
    totpSecretEncrypted: TOTP,
    totpEnabledAt: NOW,
    totpLastUsedStep: 5,
    guardian: { email: GUARDIAN_EMAIL, consentToken: TOKEN, name: 'Guardian Name' },
    consentToken: TOKEN,
    declaredCountry: 'GB',
    derivedCountry: 'GB',
    avatarKey: 'profile-media/secret-key',
    coverKey: 'private-media/secret-key',
    avatarRejectionReason: 'internal reason',
    ...over,
  };
}

interface Fixture {
  user?: ReturnType<typeof userRow> | null;
  posts?: Array<Record<string, unknown>>;
  comments?: Array<Record<string, unknown>>;
  follows?: Array<Record<string, unknown>>;
  messages?: Array<Record<string, unknown>>;
}

function buildPrisma(f: Fixture = {}) {
  const page = (rows: Array<Record<string, unknown>> = []) =>
    jest.fn(async (args: { take: number; cursor?: { id: string }; skip?: number; where?: unknown; select?: unknown }) => {
      const start = args.cursor ? rows.findIndex((r) => r.id === args.cursor!.id) + 1 : 0;
      return rows.slice(start, start + args.take);
    });
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(f.user === undefined ? userRow() : f.user) },
    post: { findMany: page(f.posts) },
    comment: { findMany: page(f.comments) },
    follow: { findMany: page(f.follows) },
    message: { findMany: page(f.messages) },
  };
  return prisma;
}

const asPrisma = (p: unknown) => p as unknown as PrismaService;

describe('buildDataExportFile', () => {
  it('has the five sections and nothing else', async () => {
    const out = await buildDataExportFile(asPrisma(buildPrisma()), dob, 'user-1', NOW);
    expect(Object.keys(out).sort()).toEqual(
      ['comments', 'following', 'format', 'formatVersion', 'generatedAt', 'posts', 'profile', 'sentMessages'].sort(),
    );
    expect(out.format).toBe('soccernity-data-export');
    expect(out.generatedAt).toBe(NOW.toISOString());
  });

  it('exports the profile as the owner sees it, with the date of birth decrypted', async () => {
    const out = await buildDataExportFile(asPrisma(buildPrisma()), dob, 'user-1', NOW);
    expect(out.profile).toEqual({
      id: 'user-1',
      email: 'me@example.com',
      phone: '+2348000000000',
      displayName: 'Real Name',
      username: 'myhandle',
      dateOfBirth: '2010-05-04T00:00:00.000Z',
      isMinor: true,
      isUnder16: true,
      role: 'fan',
      verificationStatus: 'verified',
      createdAt: '2026-01-01T00:00:00.000Z',
      bio: 'my bio',
      preferredClub: 'My FC',
      profileCountry: 'NG',
      avatar: { status: 'approved', url: 'https://cdn.example/a.jpg' },
      cover: { status: 'pending', url: null }, // a picture still under review has no live address yet
      isTeamOrganiser: false,
      representedClub: { id: 'club-1', name: 'Club One' },
    });
  });

  it('handles an account with no date of birth and no represented club', async () => {
    const out = await buildDataExportFile(
      asPrisma(buildPrisma({ user: userRow({ dateOfBirth: null, representedClub: null, avatarStatus: null, avatarUrl: null }) })),
      dob,
      'user-1',
      NOW,
    );
    expect(out.profile.dateOfBirth).toBeNull();
    expect(out.profile.representedClub).toBeNull();
    expect(out.profile.avatar).toEqual({ status: null, url: null });
  });

  it('throws when the account is gone (the request then fails)', async () => {
    await expect(buildDataExportFile(asPrisma(buildPrisma({ user: null })), dob, 'user-1', NOW)).rejects.toThrow('Account not found');
  });

  describe('NOTHING OUTSIDE THE SCOPE reaches the file', () => {
    it('drops every credential, token, secret, guardian and safeguarding field even if the rows carry them', async () => {
      const out = await buildDataExportFile(
        asPrisma(
          buildPrisma({
            posts: [
              {
                id: 'p1',
                contentText: 'hello',
                mediaUrls: ['https://cdn.example/m.jpg'],
                clubPageId: null,
                banterRoomId: null,
                createdAt: NOW,
                media: [{ id: 'm1', kind: 'image', status: 'approved', privateKey: 'private-media/x', rejectionReason: 'r' }],
                authorId: 'user-1',
                visibleFrom: NOW,
              },
            ],
            comments: [{ id: 'c1', postId: 'p1', contentText: 'nice', createdAt: NOW, authorId: 'user-1', hidden: true }],
            follows: [
              { id: 'f1', followee: { id: 'u2', username: 'other', displayName: 'Other Real', email: 'other@example.com', passwordHash: SECRET_HASH } },
            ],
            messages: [
              {
                id: 'msg1',
                conversationId: 'conv-1',
                contentText: 'current text',
                sentAt: NOW,
                editedAt: NOW,
                originalContentText: ORIGINAL_TEXT,
                deletedForEveryoneAt: null,
                senderId: 'user-1',
                mediaUrl: 'https://x/y',
              },
            ],
          }),
        ),
        dob,
        'user-1',
        NOW,
      );
      const json = JSON.stringify(out);
      for (const secret of [SECRET_HASH, GUARDIAN_EMAIL, TOKEN, TOTP, ORIGINAL_TEXT, 'profile-media/secret-key', 'private-media/', 'internal reason', 'other@example.com', 'Other Real', 'GB']) {
        expect(json).not.toContain(secret);
      }
      const keys = collectKeys(out);
      for (const forbidden of FORBIDDEN_KEYS) expect(keys.has(forbidden)).toBe(false);
      // Extra columns on the loaded rows (hidden, authorId, visibleFrom, mediaUrl, privateKey ...) are not exported either.
      for (const extra of ['hidden', 'authorId', 'visibleFrom', 'mediaUrl', 'privateKey', 'rejectionReason']) {
        expect(keys.has(extra)).toBe(false);
      }
    });

    it('never selects a column outside the allowlist (the selects themselves are the first layer)', () => {
      const allSelects = { PROFILE_SELECT, POST_SELECT, COMMENT_SELECT, FOLLOWING_SELECT, MESSAGE_SELECT };
      for (const select of Object.values(allSelects)) {
        const keys = collectKeys(select);
        for (const forbidden of FORBIDDEN_KEYS) expect(keys.has(forbidden)).toBe(false);
      }
      // The follow select reaches the followee ONLY for id and the two name inputs (no email, no hash).
      expect(FOLLOWING_SELECT.followee.select).toEqual({ id: true, username: true, displayName: true });
    });

    it('queries only the owner\'s own rows, and only messages the owner SENT that were not deleted for everyone', async () => {
      const prisma = buildPrisma();
      await buildDataExportFile(asPrisma(prisma), dob, 'user-1', NOW);
      expect(prisma.post.findMany.mock.calls[0][0].where).toEqual({ authorId: 'user-1' });
      expect(prisma.comment.findMany.mock.calls[0][0].where).toEqual({ authorId: 'user-1' });
      expect(prisma.follow.findMany.mock.calls[0][0].where).toEqual({ followerId: 'user-1' });
      expect(prisma.message.findMany.mock.calls[0][0].where).toEqual({ senderId: 'user-1', deletedForEveryoneAt: null });
      expect(prisma.message.findMany.mock.calls[0][0].select).toEqual(MESSAGE_SELECT);
    });
  });

  describe('the sections', () => {
    it('lists the people followed by id and PUBLIC name only', async () => {
      const out = await buildDataExportFile(
        asPrisma(
          buildPrisma({
            follows: [
              { id: 'f1', followee: { id: 'u2', username: 'coolhandle', displayName: 'Cool Real Name' } },
              { id: 'f2', followee: { id: 'u3', username: null, displayName: 'No Handle Real' } },
              { id: 'f3', followee: { id: 'u4', username: null, displayName: '[deleted user]' } },
            ],
          }),
        ),
        dob,
        'user-1',
        NOW,
      );
      expect(out.following).toEqual([
        { id: 'u2', publicName: 'coolhandle' },
        { id: 'u3', publicName: 'Soccernity member' }, // no username: the real name is never exported
        { id: 'u4', publicName: '[deleted user]' },
      ]);
      expect(JSON.stringify(out.following)).not.toContain('Real');
    });

    it('exports a post with its media references and a comment with its post id', async () => {
      const out = await buildDataExportFile(
        asPrisma(
          buildPrisma({
            posts: [
              {
                id: 'p1',
                contentText: 'text',
                mediaUrls: ['u1', 'u2'],
                clubPageId: 'club-1',
                banterRoomId: null,
                createdAt: NOW,
                media: [{ id: 'm1', kind: 'video', status: 'pending' }],
              },
            ],
            comments: [{ id: 'c1', postId: 'p9', contentText: 'hi', createdAt: NOW }],
          }),
        ),
        dob,
        'user-1',
        NOW,
      );
      expect(out.posts).toEqual([
        {
          id: 'p1',
          contentText: 'text',
          mediaUrls: ['u1', 'u2'],
          media: [{ id: 'm1', kind: 'video', status: 'pending' }],
          clubPageId: 'club-1',
          banterRoomId: null,
          createdAt: NOW.toISOString(),
        },
      ]);
      expect(out.comments).toEqual([{ id: 'c1', postId: 'p9', contentText: 'hi', createdAt: NOW.toISOString() }]);
    });

    it('exports the CURRENT text of an edited message, with when it was edited, and no original', async () => {
      const out = await buildDataExportFile(
        asPrisma(
          buildPrisma({
            messages: [
              { id: 'm1', conversationId: 'c1', contentText: 'edited version', sentAt: NOW, editedAt: new Date('2026-11-18T11:00:00.000Z'), originalContentText: ORIGINAL_TEXT },
            ],
          }),
        ),
        dob,
        'user-1',
        NOW,
      );
      expect(out.sentMessages[0]).toEqual({
        id: 'm1',
        conversationId: 'c1',
        contentText: 'edited version',
        sentAt: NOW.toISOString(),
        editedAt: '2026-11-18T11:00:00.000Z',
      });
      expect(JSON.stringify(out)).not.toContain(ORIGINAL_TEXT);
    });

    it('reads a long list in pages and returns every row once, in order', async () => {
      const total = DATA_EXPORT_PAGE_SIZE * 2 + 7;
      const comments = Array.from({ length: total }, (_, i) => ({
        id: `c${String(i).padStart(5, '0')}`,
        postId: 'p',
        contentText: `t${i}`,
        createdAt: NOW,
      }));
      const prisma = buildPrisma({ comments });
      const out = await buildDataExportFile(asPrisma(prisma), dob, 'user-1', NOW);
      expect(out.comments).toHaveLength(total);
      expect(out.comments.map((c) => c.id)).toEqual(comments.map((c) => c.id));
      expect(prisma.comment.findMany).toHaveBeenCalledTimes(3);
    });

    it('an account with no content still produces a valid file with empty lists', async () => {
      const out = await buildDataExportFile(asPrisma(buildPrisma()), dob, 'user-1', NOW);
      expect(out.posts).toEqual([]);
      expect(out.comments).toEqual([]);
      expect(out.following).toEqual([]);
      expect(out.sentMessages).toEqual([]);
    });
  });
});
