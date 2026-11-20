import { DobEncryptionService } from '../../crypto/dob-encryption.service';
import { PrismaService } from '../../prisma/prisma.service';
import { resolvePublicName } from '../users/public-name.util';
import { DATA_EXPORT_FORMAT, DATA_EXPORT_FORMAT_VERSION, DATA_EXPORT_PAGE_SIZE } from './data-export.constants';

// backend/b060-data-export (B-060; Decision Log #472 (g)). Builds the JSON document for ONE account holder. The
// scope is fixed by the founder: the person's own profile, posts, comments, follows and sent messages. NOTHING else.
//
// HOW THE SCOPE IS ENFORCED, in three layers so a later edit cannot widen it by accident:
//   1. every query below has an explicit `select` naming only the columns that go in the file (no `include`, no
//      row spread), so a column added to a model later never reaches the file;
//   2. every row is mapped field by field into a new object (never `...row`), so even a select that was widened
//      by mistake cannot leak an extra column;
//   3. data-export-file.builder.spec.ts feeds rows loaded with a password hash, tokens, a two-factor secret, a
//      guardian email and another person's message, and fails if any of it reaches the output.
//
// NOT in the file (on purpose): the password hash, any token or secret, the two-factor secret and backup codes,
// the guardian's name or email, the country used for safeguarding, other people's messages, reports about or by
// the person, moderation records, admin notes, the original text of an edited message, and any message the sender
// deleted for everyone.

export interface DataExportFile {
  format: typeof DATA_EXPORT_FORMAT;
  formatVersion: number;
  generatedAt: string;
  profile: Record<string, unknown>;
  posts: Array<Record<string, unknown>>;
  comments: Array<Record<string, unknown>>;
  following: Array<{ id: string; publicName: string }>;
  sentMessages: Array<Record<string, unknown>>;
}

// The columns that make up the profile, "as the owner sees them". Exported so the spec can assert the allowlist.
export const PROFILE_SELECT = {
  id: true,
  email: true,
  phone: true,
  displayName: true,
  username: true,
  dateOfBirth: true, // stored encrypted; decrypted here for the owner only
  isMinor: true,
  isUnder16: true,
  role: true,
  verificationStatus: true,
  createdAt: true,
  bio: true,
  preferredClub: true,
  profileCountry: true,
  avatarUrl: true,
  avatarStatus: true,
  coverUrl: true,
  coverStatus: true,
  isTeamOrganiser: true,
  representedClub: { select: { id: true, name: true } },
} as const;

export const POST_SELECT = {
  id: true,
  contentText: true,
  mediaUrls: true,
  clubPageId: true,
  banterRoomId: true,
  createdAt: true,
  media: { select: { id: true, kind: true, status: true } },
} as const;

export const COMMENT_SELECT = { id: true, postId: true, contentText: true, createdAt: true } as const;

export const FOLLOWING_SELECT = {
  id: true,
  followee: { select: { id: true, username: true, displayName: true } },
} as const;

export const MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  contentText: true,
  sentAt: true,
  editedAt: true,
} as const;

/** Reads a table in pages of DATA_EXPORT_PAGE_SIZE by id cursor (the order each caller asks for is stable). */
async function readAll<T extends { id: string }>(
  page: (cursor: string | undefined, take: number) => Promise<T[]>,
): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  for (;;) {
    const rows = await page(cursor, DATA_EXPORT_PAGE_SIZE);
    out.push(...rows);
    if (rows.length < DATA_EXPORT_PAGE_SIZE) return out;
    cursor = rows[rows.length - 1].id;
  }
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export async function buildDataExportFile(
  prisma: PrismaService,
  dob: DobEncryptionService,
  userId: string,
  now: Date,
): Promise<DataExportFile> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: PROFILE_SELECT });
  if (!user) throw new Error('Account not found');

  const [posts, comments, follows, messages] = await Promise.all([
    readAll((cursor, take) =>
      prisma.post.findMany({
        where: { authorId: userId },
        select: POST_SELECT,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
    ),
    readAll((cursor, take) =>
      prisma.comment.findMany({
        where: { authorId: userId },
        select: COMMENT_SELECT,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
    ),
    readAll((cursor, take) =>
      prisma.follow.findMany({
        where: { followerId: userId },
        select: FOLLOWING_SELECT,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
    ),
    // Messages the person SENT only. A message deleted for everyone is not exported (their own reads show a
    // placeholder for it). The text is the CURRENT text of an edited message; the original is never selected.
    readAll((cursor, take) =>
      prisma.message.findMany({
        where: { senderId: userId, deletedForEveryoneAt: null },
        select: MESSAGE_SELECT,
        orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
        take,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
    ),
  ]);

  // Field-by-field mapping, never a spread (layer 2 above).
  const profile: Record<string, unknown> = {
    id: user.id,
    email: user.email,
    phone: user.phone,
    displayName: user.displayName,
    username: user.username,
    dateOfBirth: iso(dob.decryptNullable(user.dateOfBirth)),
    isMinor: user.isMinor,
    isUnder16: user.isUnder16,
    role: user.role,
    verificationStatus: user.verificationStatus,
    createdAt: iso(user.createdAt),
    bio: user.bio,
    preferredClub: user.preferredClub,
    profileCountry: user.profileCountry,
    // A picture's address is included only once it is approved (before that it is not a live address).
    avatar: { status: user.avatarStatus, url: user.avatarStatus === 'approved' ? user.avatarUrl : null },
    cover: { status: user.coverStatus, url: user.coverStatus === 'approved' ? user.coverUrl : null },
    isTeamOrganiser: user.isTeamOrganiser,
    representedClub: user.representedClub ? { id: user.representedClub.id, name: user.representedClub.name } : null,
  };

  return {
    format: DATA_EXPORT_FORMAT,
    formatVersion: DATA_EXPORT_FORMAT_VERSION,
    generatedAt: now.toISOString(),
    profile,
    posts: posts.map((p) => ({
      id: p.id,
      contentText: p.contentText,
      mediaUrls: [...p.mediaUrls],
      media: p.media.map((m) => ({ id: m.id, kind: m.kind, status: m.status })),
      clubPageId: p.clubPageId,
      banterRoomId: p.banterRoomId,
      createdAt: iso(p.createdAt),
    })),
    comments: comments.map((c) => ({
      id: c.id,
      postId: c.postId,
      contentText: c.contentText,
      createdAt: iso(c.createdAt),
    })),
    // The accounts the person follows: id and public name ONLY (the minimum; Decision Log #472 (g) leaves
    // "names of others" open, so nothing about them beyond how they appear to everyone).
    following: follows.map((f) => ({
      id: f.followee.id,
      publicName: resolvePublicName({ username: f.followee.username, displayName: f.followee.displayName }),
    })),
    sentMessages: messages.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      contentText: m.contentText,
      sentAt: iso(m.sentAt),
      editedAt: iso(m.editedAt),
    })),
  };
}
