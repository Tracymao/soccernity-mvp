import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// backend/b289-content-removal (B-289, Decision Log #483), against REAL Postgres. A moderator's content_removed is
// ENFORCED for a post, a comment and a message: soft removal (row and text stay), every user-facing read treats the
// item as removed, the author of a removed post gets a stub on a direct visit, a comment and a message stay in
// their thread as text-less stubs, commentCount drops, only the reported target is touched (never a context
// message), and an overturned appeal restores it only when THIS report removed it.
describe('Content removal e2e (b289-content-removal)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  const rand = () => Math.random().toString(36).slice(2);
  const server = () => app.getHttpServer();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const MISSING = '22222222-2222-4222-8222-222222222222';

  async function createUser(label: string): Promise<{ userId: string; accessToken: string }> {
    const prisma = getTestPrismaClient();
    const user = await prisma.user.create({
      data: {
        email: `e2e-rm-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `Real Name ${label}`,
        username: `rm_${label}_${rand().slice(0, 5)}`,
        verificationStatus: 'verified',
        dateOfBirth: seedDob('1993-03-03'),
        isMinor: false,
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { userId: user.id, accessToken: accessToken.token };
  }

  async function createAdmin(label: string) {
    const prisma = getTestPrismaClient();
    const admin = await prisma.adminUser.create({
      data: {
        email: `e2e-rm-admin-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused',
        fullName: `E2E Removal Admin ${label}`,
        role: 'moderator',
        childSafetyVetted: true,
      },
    });
    const { accessToken } = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
    return { adminId: admin.id, accessToken: accessToken.token };
  }

  const fileReport = (token: string, targetType: string, targetId: string, over: Record<string, unknown> = {}) =>
    request(server())
      .post('/reports')
      .set(auth(token))
      .send({ targetType, targetId, reasonCategory: 'spam_or_scam', ...over });

  const action = (adminToken: string, reportId: string, act: string) =>
    request(server()).patch(`/admin/moderation/reports/${reportId}`).set(auth(adminToken)).send({ action: act });

  // author A (posts), viewer V (follows A), a stranger S, two moderators.
  async function world() {
    const prisma = getTestPrismaClient();
    const author = await createUser('author');
    const viewer = await createUser('viewer');
    const stranger = await createUser('stranger');
    const mod1 = await createAdmin('one');
    const mod2 = await createAdmin('two');
    await prisma.follow.create({ data: { followerId: viewer.userId, followeeId: author.userId } });
    return { prisma, author, viewer, stranger, mod1, mod2 };
  }

  async function makePost(authorId: string, contentText = 'a perfectly ordinary post zzremoval') {
    return getTestPrismaClient().post.create({ data: { authorId, contentText } });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // POST
  // ---------------------------------------------------------------------------------------------------------------
  describe('a post', () => {
    it('is soft-removed in the same step as recording the action, and every read honours it', async () => {
      const { prisma, author, viewer, stranger, mod1 } = await world();
      const post = await makePost(author.userId, 'zzremoval post with a tag #removalcheck');
      const keep = await makePost(author.userId, 'zzremoval a second post that stays');
      // hashtag rows for trending, written exactly as createPost writes them
      const tag = await prisma.hashtag.create({ data: { tag: 'removalcheck', postCount: 1 } });
      await prisma.postHashtag.create({ data: { hashtagId: tag.id, postId: post.id, createdAt: new Date() } });
      // the viewer saved it; a like notification points at it
      await prisma.savedPost.create({ data: { userId: viewer.userId, postId: post.id } });
      await prisma.notification.create({ data: { userId: author.userId, type: 'like', payloadRefId: post.id } });

      // before: everything sees it
      expect((await request(server()).get('/posts/feed').set(auth(viewer.accessToken)).expect(200)).body.items.map((i: { id: string }) => i.id)).toContain(post.id);
      expect((await request(server()).get('/trending').expect(200)).body.items.map((i: { tag: string }) => i.tag)).toContain('removalcheck');
      const beforeNotes = await request(server()).get('/notifications').set(auth(author.accessToken)).expect(200);
      expect(beforeNotes.body.items[0].data).not.toBeNull();

      const report = (await fileReport(viewer.accessToken, 'post', post.id).expect(201)).body;
      const res = await action(mod1.accessToken, report.id, 'content_removed').expect(200);
      expect(res.body).toMatchObject({ status: 'actioned', actionTaken: 'content_removed', contentRemoval: 'removed' });

      // soft: the row and its text stay, with the claim recorded
      const row = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
      expect(row.contentText).toBe('zzremoval post with a tag #removalcheck');
      expect(row.removedByModerationAt).toBeInstanceOf(Date);
      expect(row.removedByReportId).toBe(report.id);
      // the other post is untouched
      expect((await prisma.post.findUniqueOrThrow({ where: { id: keep.id } })).removedByModerationAt).toBeNull();

      // a follower's feed, the author's own feed
      for (const who of [viewer, author]) {
        const feed = await request(server()).get('/posts/feed').set(auth(who.accessToken)).expect(200);
        const ids = feed.body.items.map((i: { id: string }) => i.id);
        expect(ids).not.toContain(post.id);
        expect(ids).toContain(keep.id);
      }
      // search (signed in and anonymous)
      for (const headers of [auth(viewer.accessToken), {}]) {
        const found = await request(server()).get('/search').query({ q: 'zzremoval', scope: 'posts' }).set(headers).expect(200);
        const ids = JSON.stringify(found.body);
        expect(ids).not.toContain(post.id);
        expect(ids).toContain(keep.id);
      }
      // saved items: the SavedPost row stays, the list leaves it out
      const saved = await request(server()).get(`/users/${viewer.userId}/saved-posts`).set(auth(viewer.accessToken)).expect(200);
      expect(saved.body.items).toHaveLength(0);
      expect(await prisma.savedPost.count({ where: { postId: post.id } })).toBe(1);
      // trending counts
      expect((await request(server()).get('/trending').expect(200)).body.items.map((i: { tag: string }) => i.tag)).not.toContain('removalcheck');
      // the like notification degrades to "no longer available" (data: null)
      const afterNotes = await request(server()).get('/notifications').set(auth(author.accessToken)).expect(200);
      expect(afterNotes.body.items.find((n: { type: string }) => n.type === 'like').data).toBeNull();

      // direct reads and reactions: exactly a post that does not exist, for everyone but the author
      const missing = await request(server()).get(`/posts/${MISSING}`).set(auth(viewer.accessToken)).expect(404);
      for (const who of [viewer, stranger]) {
        const removed = await request(server()).get(`/posts/${post.id}`).set(auth(who.accessToken)).expect(404);
        expect(removed.body).toEqual(missing.body);
      }
      for (const path of [`/posts/${post.id}/comments`]) {
        const removed = await request(server()).get(path).set(auth(viewer.accessToken)).expect(404);
        const gone = await request(server()).get(path.replace(post.id, MISSING)).set(auth(viewer.accessToken)).expect(404);
        expect(removed.body).toEqual(gone.body);
      }
      const likeRemoved = await request(server()).post(`/posts/${post.id}/like`).set(auth(viewer.accessToken)).expect(404);
      const likeMissing = await request(server()).post(`/posts/${MISSING}/like`).set(auth(viewer.accessToken)).expect(404);
      expect(likeRemoved.body).toEqual(likeMissing.body);
      await request(server()).post(`/posts/${post.id}/save`).set(auth(stranger.accessToken)).expect(404);
    });

    it('the AUTHOR alone gets the stub on a direct visit: 200 with { id, removedByModeration: true } and nothing else', async () => {
      const { author, viewer, mod1 } = await world();
      const post = await makePost(author.userId);
      const report = (await fileReport(viewer.accessToken, 'post', post.id).expect(201)).body;
      await action(mod1.accessToken, report.id, 'content_removed').expect(200);

      const res = await request(server()).get(`/posts/${post.id}`).set(auth(author.accessToken)).expect(200);
      expect(res.body).toEqual({ id: post.id, removedByModeration: true });
    });

    it('a club feed and a Banter room feed leave a removed post out too', async () => {
      const { prisma, author, viewer, mod1 } = await world();
      const club = await prisma.clubPage.create({ data: { name: `Club ${rand()}` } });
      const room = await prisma.banterRoom.create({ data: { name: `Room ${rand()}`, scopeType: 'topic', createdBy: author.userId } });
      const clubPost = await prisma.post.create({ data: { authorId: author.userId, contentText: 'club post', clubPageId: club.id } });
      const roomPost = await prisma.post.create({ data: { authorId: author.userId, contentText: 'room post', banterRoomId: room.id } });
      for (const p of [clubPost, roomPost]) {
        const report = (await fileReport(viewer.accessToken, 'post', p.id).expect(201)).body;
        await action(mod1.accessToken, report.id, 'content_removed').expect(200);
      }
      const clubFeed = await request(server()).get(`/clubs/${club.id}/feed`).set(auth(viewer.accessToken)).expect(200);
      expect(clubFeed.body.items).toHaveLength(0);
      const roomFeed = await request(server()).get(`/banter-rooms/${room.id}/posts`).set(auth(viewer.accessToken)).expect(200);
      expect(roomFeed.body.items).toHaveLength(0);
    });

    it('a second report that removes the same post leaves the first claim and says so', async () => {
      const { prisma, author, viewer, stranger, mod1 } = await world();
      const post = await makePost(author.userId);
      const r1 = (await fileReport(viewer.accessToken, 'post', post.id).expect(201)).body;
      const r2 = (await fileReport(stranger.accessToken, 'post', post.id).expect(201)).body;
      await action(mod1.accessToken, r1.id, 'content_removed').expect(200);
      const second = await action(mod1.accessToken, r2.id, 'content_removed').expect(200);
      expect(second.body.contentRemoval).toBe('already_removed');
      expect((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).removedByReportId).toBe(r1.id);
    });

    it('an overturned appeal restores the post, but only when THAT report removed it', async () => {
      const { prisma, author, viewer, stranger, mod1, mod2 } = await world();
      const post = await makePost(author.userId);
      const r1 = (await fileReport(viewer.accessToken, 'post', post.id).expect(201)).body;
      const r2 = (await fileReport(stranger.accessToken, 'post', post.id).expect(201)).body;
      await action(mod1.accessToken, r1.id, 'content_removed').expect(200);
      await action(mod1.accessToken, r2.id, 'content_removed').expect(200); // already_removed: r1 keeps the claim

      // appealing r2 and overturning it must NOT bring the post back (r2 never removed it)
      await request(server()).post(`/reports/${r2.id}/appeal`).set(auth(author.accessToken)).send({ reason: 'not mine to lose' }).expect(201);
      await request(server()).patch(`/admin/moderation/reports/${r2.id}/appeal`).set(auth(mod2.accessToken)).send({ decision: 'overturned' }).expect(200);
      expect((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).removedByModerationAt).not.toBeNull();

      // appealing r1 (the one that removed it) and upholding changes nothing; overturning restores it
      await request(server()).post(`/reports/${r1.id}/appeal`).set(auth(author.accessToken)).send({ reason: 'please look again' }).expect(201);
      await request(server()).patch(`/admin/moderation/reports/${r1.id}/appeal`).set(auth(mod2.accessToken)).send({ decision: 'overturned' }).expect(200);
      const restored = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
      expect(restored.removedByModerationAt).toBeNull();
      expect(restored.removedByReportId).toBeNull();
      const res = await request(server()).get(`/posts/${post.id}`).set(auth(viewer.accessToken)).expect(200);
      expect(res.body.id).toBe(post.id);
    });

    it('an UPHELD appeal leaves the post removed', async () => {
      const { prisma, author, viewer, mod1, mod2 } = await world();
      const post = await makePost(author.userId);
      const r1 = (await fileReport(viewer.accessToken, 'post', post.id).expect(201)).body;
      await action(mod1.accessToken, r1.id, 'content_removed').expect(200);
      await request(server()).post(`/reports/${r1.id}/appeal`).set(auth(author.accessToken)).send({ reason: 'x' }).expect(201);
      await request(server()).patch(`/admin/moderation/reports/${r1.id}/appeal`).set(auth(mod2.accessToken)).send({ decision: 'upheld' }).expect(200);
      expect((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).removedByModerationAt).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  // COMMENT
  // ---------------------------------------------------------------------------------------------------------------
  describe('a comment', () => {
    async function commentSetup() {
      const w = await world();
      const post = await makePost(w.author.userId);
      const commenter = w.stranger;
      const c1 = await w.prisma.comment.create({ data: { postId: post.id, authorId: commenter.userId, contentText: 'first comment text' } });
      const c2 = await w.prisma.comment.create({ data: { postId: post.id, authorId: w.viewer.userId, contentText: 'second comment text' } });
      await w.prisma.post.update({ where: { id: post.id }, data: { commentCount: 2 } });
      return { ...w, post, commenter, c1, c2 };
    }
    const count = async (id: string) => (await getTestPrismaClient().post.findUniqueOrThrow({ where: { id } })).commentCount;

    it('stays in the thread as a text-less stub with no author, and is not counted', async () => {
      const { post, viewer, author, c1, c2, mod1 } = await commentSetup();
      const report = (await fileReport(viewer.accessToken, 'comment', c1.id).expect(201)).body;
      const res = await action(mod1.accessToken, report.id, 'content_removed').expect(200);
      expect(res.body.contentRemoval).toBe('removed');

      for (const who of [viewer, author]) {
        const thread = await request(server()).get(`/posts/${post.id}/comments`).set(auth(who.accessToken)).expect(200);
        expect(thread.body.items).toHaveLength(2);
        const stub = thread.body.items.find((i: { id: string }) => i.id === c1.id);
        expect(Object.keys(stub).sort()).toEqual(['createdAt', 'id', 'removedByModeration']);
        expect(stub.removedByModeration).toBe(true);
        expect(JSON.stringify(thread.body)).not.toContain('first comment text');
        const other = thread.body.items.find((i: { id: string }) => i.id === c2.id);
        expect(other.contentText).toBe('second comment text');
      }
      // not counted; the row and text stay
      expect(await count(post.id)).toBe(1);
      expect((await getTestPrismaClient().comment.findUniqueOrThrow({ where: { id: c1.id } })).contentText).toBe('first comment text');
    });

    it('a hidden comment is not subtracted twice, a second removal changes nothing, and deleting a removed comment does not subtract again', async () => {
      const { prisma, post, viewer, author, commenter, c1, c2, mod1 } = await commentSetup();
      // hide c1 as the post author: count 2 -> 1
      await request(server()).patch(`/posts/${post.id}/comments/${c1.id}/hide`).set(auth(author.accessToken)).expect(200);
      expect(await count(post.id)).toBe(1);
      // remove the hidden c1: no second subtraction
      const r1 = (await fileReport(viewer.accessToken, 'comment', c1.id).expect(201)).body;
      await action(mod1.accessToken, r1.id, 'content_removed').expect(200);
      expect(await count(post.id)).toBe(1);
      // a second report on the same comment: already_removed, no change
      const r1b = (await fileReport(author.accessToken, 'comment', c1.id).expect(201)).body;
      expect((await action(mod1.accessToken, r1b.id, 'content_removed').expect(200)).body.contentRemoval).toBe('already_removed');
      expect(await count(post.id)).toBe(1);
      // removing the visible c2 takes the count to 0, deleting the removed c2 afterwards leaves it at 0
      const r2 = (await fileReport(commenter.accessToken, 'comment', c2.id).expect(201)).body;
      await action(mod1.accessToken, r2.id, 'content_removed').expect(200);
      expect(await count(post.id)).toBe(0);
      await request(server()).delete(`/posts/${post.id}/comments/${c2.id}`).set(auth(author.accessToken)).expect(204);
      expect(await count(post.id)).toBe(0);
      expect(await prisma.comment.count({ where: { id: c2.id } })).toBe(0);
    });

    it('an overturned appeal restores the comment and counts it again (unless it is hidden)', async () => {
      const { post, viewer, commenter, c1, mod1, mod2 } = await commentSetup();
      const report = (await fileReport(viewer.accessToken, 'comment', c1.id).expect(201)).body;
      await action(mod1.accessToken, report.id, 'content_removed').expect(200);
      expect(await count(post.id)).toBe(1);
      await request(server()).post(`/reports/${report.id}/appeal`).set(auth(commenter.accessToken)).send({ reason: 'unfair' }).expect(201);
      await request(server()).patch(`/admin/moderation/reports/${report.id}/appeal`).set(auth(mod2.accessToken)).send({ decision: 'overturned' }).expect(200);
      expect(await count(post.id)).toBe(2);
      const thread = await request(server()).get(`/posts/${post.id}/comments`).set(auth(viewer.accessToken)).expect(200);
      expect(thread.body.items.find((i: { id: string }) => i.id === c1.id).contentText).toBe('first comment text');
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  // MESSAGE
  // ---------------------------------------------------------------------------------------------------------------
  describe('a message', () => {
    async function chat() {
      const prisma = getTestPrismaClient();
      const sender = await createUser('sender');
      const recipient = await createUser('recipient');
      const mod1 = await createAdmin('m1');
      const mod2 = await createAdmin('m2');
      const ids = [sender.userId, recipient.userId].sort();
      const conversation = await prisma.conversation.create({
        data: { participantIds: ids, participantKey: ids.join(':'), lastMessageAt: new Date('2026-02-01T10:03:00Z') },
      });
      const mk = (senderId: string, contentText: string, minute: number) =>
        prisma.message.create({
          data: { conversationId: conversation.id, senderId, contentText, sentAt: new Date(`2026-02-01T10:0${minute}:00Z`) },
        });
      const before = await mk(recipient.userId, 'CONTEXT BEFORE', 1);
      const target = await mk(sender.userId, 'THE REPORTED TEXT', 2);
      const after = await mk(recipient.userId, 'CONTEXT AFTER', 3);
      return { prisma, sender, recipient, mod1, mod2, conversation, before, target, after };
    }

    it('removes ONLY the reported message (never a context message) and shows the exact stub to both people', async () => {
      const { prisma, sender, recipient, mod1, conversation, before, target, after } = await chat();
      const report = (
        await fileReport(recipient.accessToken, 'message', target.id, { contextMessageIds: [before.id, after.id] }).expect(201)
      ).body;
      const res = await action(mod1.accessToken, report.id, 'content_removed').expect(200);
      expect(res.body.contentRemoval).toBe('removed');

      expect((await prisma.message.findUniqueOrThrow({ where: { id: target.id } })).removedByReportId).toBe(report.id);
      expect((await prisma.message.findUniqueOrThrow({ where: { id: before.id } })).removedByModerationAt).toBeNull();
      expect((await prisma.message.findUniqueOrThrow({ where: { id: after.id } })).removedByModerationAt).toBeNull();
      expect((await prisma.message.findUniqueOrThrow({ where: { id: target.id } })).contentText).toBe('THE REPORTED TEXT');

      for (const who of [sender, recipient]) {
        const thread = await request(server()).get(`/conversations/${conversation.id}/messages`).set(auth(who.accessToken)).expect(200);
        expect(thread.body.items).toHaveLength(3);
        const stub = thread.body.items.find((i: { id: string }) => i.id === target.id);
        // B-296: isMine says whether the VIEWER sent it; the sender's id is never returned.
        expect(Object.keys(stub).sort()).toEqual(['id', 'isMine', 'removedByModeration', 'sentAt']);
        expect(stub.removedByModeration).toBe(true);
        expect(stub.isMine).toBe(who === sender);
        expect(JSON.stringify(thread.body)).not.toContain('THE REPORTED TEXT');
        expect(thread.body.items.find((i: { id: string }) => i.id === before.id).contentText).toBe('CONTEXT BEFORE');
      }
    });

    it('is the conversation-list preview stub when it is the last message', async () => {
      const { sender, recipient, mod1, conversation, target } = await chat();
      await getTestPrismaClient().message.deleteMany({ where: { conversationId: conversation.id, id: { not: target.id } } });
      const report = (await fileReport(recipient.accessToken, 'message', target.id).expect(201)).body;
      await action(mod1.accessToken, report.id, 'content_removed').expect(200);
      for (const who of [sender, recipient]) {
        const list = await request(server()).get('/conversations').set(auth(who.accessToken)).expect(200);
        const row = list.body.items.find((c: { id: string }) => c.id === conversation.id);
        expect(row.lastMessage).toEqual({ id: target.id, sentAt: expect.any(String), removedByModeration: true, isMine: who === sender });
        expect(JSON.stringify(list.body)).not.toContain('THE REPORTED TEXT');
      }
    });

    it('the SENDER can no longer edit or delete it (409 message_removed); the other person can still hide it for themselves', async () => {
      const { sender, recipient, mod1, conversation, target } = await chat();
      const report = (await fileReport(recipient.accessToken, 'message', target.id).expect(201)).body;
      await action(mod1.accessToken, report.id, 'content_removed').expect(200);
      const base = `/conversations/${conversation.id}/messages/${target.id}`;
      const edit = await request(server()).patch(base).set(auth(sender.accessToken)).send({ contentText: 'sneaky edit' }).expect(409);
      expect(edit.body.code).toBe('message_removed');
      for (const scope of ['everyone', 'me']) {
        const del = await request(server()).delete(base).query({ scope }).set(auth(sender.accessToken)).expect(409);
        expect(del.body.code).toBe('message_removed');
      }
      await request(server()).delete(base).query({ scope: 'me' }).set(auth(recipient.accessToken)).expect(204);
      const row = await getTestPrismaClient().message.findUniqueOrThrow({ where: { id: target.id } });
      expect(row.editedAt).toBeNull();
      expect(row.deletedForEveryoneAt).toBeNull();
    });

    it('the admin report detail still returns the FULL message plus removedByModerationAt', async () => {
      const { recipient, mod1, target } = await chat();
      const report = (await fileReport(recipient.accessToken, 'message', target.id).expect(201)).body;
      await action(mod1.accessToken, report.id, 'content_removed').expect(200);
      const detail = await request(server()).get(`/admin/moderation/reports/${report.id}`).set(auth(mod1.accessToken)).expect(200);
      expect(detail.body.reportedMessage).toMatchObject({ id: target.id, contentText: 'THE REPORTED TEXT' });
      expect(detail.body.reportedMessage.removedByModerationAt).not.toBeNull();
    });

    it('an overturned appeal restores the message', async () => {
      const { prisma, sender, recipient, mod1, mod2, conversation, target } = await chat();
      const report = (await fileReport(recipient.accessToken, 'message', target.id).expect(201)).body;
      await action(mod1.accessToken, report.id, 'content_removed').expect(200);
      await request(server()).post(`/reports/${report.id}/appeal`).set(auth(sender.accessToken)).send({ reason: 'it was fine' }).expect(201);
      await request(server()).patch(`/admin/moderation/reports/${report.id}/appeal`).set(auth(mod2.accessToken)).send({ decision: 'overturned' }).expect(200);
      expect((await prisma.message.findUniqueOrThrow({ where: { id: target.id } })).removedByModerationAt).toBeNull();
      const thread = await request(server()).get(`/conversations/${conversation.id}/messages`).set(auth(recipient.accessToken)).expect(200);
      expect(thread.body.items.find((i: { id: string }) => i.id === target.id).contentText).toBe('THE REPORTED TEXT');
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  // WHERE content_removed IS OFFERED
  // ---------------------------------------------------------------------------------------------------------------
  describe('content_removed on any other target', () => {
    it('is a 400 with the stable code content_removal_not_applicable, and the report stays open', async () => {
      const { prisma, author, viewer, mod1 } = await world();
      const report = (await fileReport(viewer.accessToken, 'user', author.userId).expect(201)).body;
      const res = await action(mod1.accessToken, report.id, 'content_removed').expect(400);
      expect(res.body.code).toBe('content_removal_not_applicable');
      expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('open');
      // the other actions are unaffected
      await action(mod1.accessToken, report.id, 'warning_issued').expect(200);
    });
  });
});
