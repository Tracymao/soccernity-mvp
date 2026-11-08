import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/modules/auth/token/token.service';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { AccountDeletionSweepService } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// B-060 (founder decision 2026-11-08): the "Public profile" toggle (User.isProfilePublic), against real
// Postgres. This is a safeguarding-adjacent READ-side change, so the matrix is wide: for the profile read and
// EVERY post-returning route in the inventory (users/README.md) it checks the owner, a follower, a stranger,
// an anonymous reader, a blocked pair, staff, an under-18 owner and an under-18 viewer, plus the settings
// endpoints, the 403 code, follow/unfollow flipping visibility, counts being absent, the single-post 404
// being byte-identical to a missing post, the exemptions (Banter, Contest) and the anonymise reset.
describe('Public profile toggle (B-060) e2e', () => {
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

  const server = () => app.getHttpServer();
  const prisma = () => getTestPrismaClient();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  let counter = 0;
  const MISSING_ID = '00000000-0000-4000-8000-000000000000';
  const NEEDLE = 'zebrafishneedle';

  interface TestUser {
    userId: string;
    accessToken: string;
    name: string;
  }

  async function mint(userId: string, role: string) {
    const { accessToken } = await app.get(TokenService).issueTokenPair(userId, role);
    return accessToken.token;
  }

  async function createUser(label: string, extra: Record<string, unknown> = {}): Promise<TestUser> {
    counter += 1;
    const name = `pubprof${label}${counter}`;
    const user = await prisma().user.create({
      data: {
        email: `${name}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: name,
        username: name,
        verificationStatus: 'verified',
        dateOfBirth: seedDob('1993-03-03'),
        isMinor: false,
        bio: `bio of ${name}`,
        ...extra,
      },
    });
    return { userId: user.id, accessToken: await mint(user.id, user.role), name };
  }

  // A minor with CONFIRMED consent (so it is not a restricted-pending 404).
  async function createMinor(label: string, extra: Record<string, unknown> = {}): Promise<TestUser> {
    counter += 1;
    const name = `pubprofminor${label}${counter}`;
    const user = await prisma().user.create({
      data: {
        email: `${name}@example.com`,
        passwordHash: 'unused',
        displayName: name,
        username: name,
        verificationStatus: 'verified',
        dateOfBirth: seedDob('2010-01-01'),
        isMinor: true,
        bio: `bio of ${name}`,
        guardian: {
          create: {
            name: 'Guardian Name',
            email: `guardian-${name}@example.com`,
            relationship: 'Parent',
            consentStatus: 'confirmed',
            consentToken: `tok-${name}-${Math.random().toString(36).slice(2)}`,
            consentTokenExpiresAt: new Date(Date.now() + 72 * 3600 * 1000),
            consentTimestamp: new Date(),
          },
        },
        ...extra,
      },
    });
    return { userId: user.id, accessToken: await mint(user.id, user.role), name };
  }

  async function adminToken(role = 'moderator') {
    const admin = await prisma().adminUser.create({
      data: {
        email: `pubprof-admin-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: 'unused',
        fullName: 'Pubprof Admin',
        role,
      },
    });
    return (await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role)).accessToken.token;
  }

  const follow = (followerId: string, followeeId: string) =>
    prisma().follow.create({ data: { followerId, followeeId } });
  const unfollow = (followerId: string, followeeId: string) =>
    prisma().follow.deleteMany({ where: { followerId, followeeId } });
  const setPublic = (userId: string, isProfilePublic: boolean) =>
    prisma().user.update({ where: { id: userId }, data: { isProfilePublic } });
  const block = (blockerId: string, blockedId: string) =>
    prisma().block.create({ data: { blockerId, blockedId } });

  // The private owner and the content that hangs off them. posts: a normal post, a club post, a Banter Room post.
  async function setup() {
    const owner = await createUser('owner', { isProfilePublic: false });
    const follower = await createUser('follower');
    const stranger = await createUser('stranger');
    await follow(follower.userId, owner.userId);

    const club = await prisma().clubPage.create({ data: { name: 'Alpha FC', league: 'L', country: 'C', memberCount: 0 } });
    const room = await prisma().banterRoom.create({
      data: { name: 'Open Room', scopeType: 'topic', createdBy: owner.userId, memberCount: 0 },
    });
    const post = await prisma().post.create({ data: { authorId: owner.userId, contentText: `${NEEDLE} normal post`, mediaUrls: [] } });
    const clubPost = await prisma().post.create({
      data: { authorId: owner.userId, contentText: `${NEEDLE} club post`, mediaUrls: [], clubPageId: club.id },
    });
    const roomPost = await prisma().post.create({
      data: { authorId: owner.userId, contentText: `${NEEDLE} room post`, mediaUrls: [], banterRoomId: room.id },
    });
    return { owner, follower, stranger, club, room, post, clubPost, roomPost };
  }

  const getProfile = (viewerToken: string, id: string) =>
    request(server()).get(`/users/${id}/public-profile`).set(auth(viewerToken));
  const getPost = (token: string, id: string) => request(server()).get(`/posts/${id}`).set(auth(token));

  // ---------------------------------------------------------------- profile read

  describe('GET /users/:id/public-profile', () => {
    it('a stranger gets the minimal card: public name, avatar, isPrivate, viewerFollows; no bio, country, cover, guardian or counts', async () => {
      const { owner, stranger } = await setup();
      const res = await getProfile(stranger.accessToken, owner.userId).expect(200);
      expect(res.body).toEqual({
        id: owner.userId,
        publicName: owner.name,
        guardianContact: null,
        bio: null,
        country: null,
        avatarUrl: null,
        coverUrl: null,
        isFollowing: false,
        viewerFollows: false,
        viewerHasBlocked: false,
        isPrivate: true,
      });
      // Counts are absent by construction: no follower, following or post count exists in this payload at all
      // (the exact key set above is the proof; this names the keys a count would use).
      for (const key of ['followerCount', 'followingCount', 'postCount', 'followersCount', 'postsCount', 'memberSince']) {
        expect(res.body).not.toHaveProperty(key);
      }
    });

    it('a follower, and the owner themself, get the full card with isPrivate false', async () => {
      const { owner, follower } = await setup();
      const asFollower = await getProfile(follower.accessToken, owner.userId).expect(200);
      expect(asFollower.body).toMatchObject({ isPrivate: false, bio: `bio of ${owner.name}`, isFollowing: true, viewerFollows: true });
      const asOwner = await getProfile(owner.accessToken, owner.userId).expect(200);
      expect(asOwner.body).toMatchObject({ isPrivate: false, bio: `bio of ${owner.name}`, viewerFollows: false });
    });

    it('following flips it to the full card at once, and unfollowing hides it again', async () => {
      const { owner, stranger } = await setup();
      expect((await getProfile(stranger.accessToken, owner.userId).expect(200)).body.isPrivate).toBe(true);
      await follow(stranger.userId, owner.userId);
      const after = await getProfile(stranger.accessToken, owner.userId).expect(200);
      expect(after.body).toMatchObject({ isPrivate: false, viewerFollows: true, bio: `bio of ${owner.name}` });
      await unfollow(stranger.userId, owner.userId);
      const again = await getProfile(stranger.accessToken, owner.userId).expect(200);
      expect(again.body).toMatchObject({ isPrivate: true, viewerFollows: false, bio: null });
    });

    it('a public profile (the default) is the full card for a stranger: nothing changes for anyone who did not opt in', async () => {
      const { owner, stranger } = await setup();
      await setPublic(owner.userId, true);
      const res = await getProfile(stranger.accessToken, owner.userId).expect(200);
      expect(res.body).toMatchObject({ isPrivate: false, bio: `bio of ${owner.name}` });
    });

    it('a blocked pair is unchanged: the owner blocked the viewer -> the same 404; the viewer blocked the owner -> the minimal card, flagged', async () => {
      const { owner, stranger } = await setup();
      const missing = await getProfile(stranger.accessToken, MISSING_ID).expect(404);
      await block(owner.userId, stranger.userId);
      const blockedByOwner = await getProfile(stranger.accessToken, owner.userId).expect(404);
      expect(blockedByOwner.body).toEqual(missing.body);
      await prisma().block.deleteMany({});
      await block(stranger.userId, owner.userId);
      const viewerBlocked = await getProfile(stranger.accessToken, owner.userId).expect(200);
      expect(viewerBlocked.body).toMatchObject({ isPrivate: true, viewerHasBlocked: true, bio: null });
    });

    it('an under-18 viewer is a stranger like any other: the minimal card', async () => {
      const { owner } = await setup();
      const minorViewer = await createMinor('viewer');
      const res = await getProfile(minorViewer.accessToken, owner.userId).expect(200);
      expect(res.body).toMatchObject({ isPrivate: true, bio: null, country: null });
    });

    it('an under-18 OWNER is always effectively public, even with the column forced to false (the safeguarding rules decide, unchanged)', async () => {
      const stranger = await createUser('s');
      const minorOwner = await createMinor('owner', { isProfilePublic: false });
      const res = await getProfile(stranger.accessToken, minorOwner.userId).expect(200);
      expect(res.body).toMatchObject({
        isPrivate: false,
        bio: `bio of ${minorOwner.name}`,
        guardianContact: { label: 'Guardian contact', email: `guardian-${minorOwner.name}@example.com` },
      });
    });

    it('takes effect on the very next read after the owner changes the setting, in both directions', async () => {
      const { owner, stranger } = await setup();
      expect((await getProfile(stranger.accessToken, owner.userId).expect(200)).body.isPrivate).toBe(true);
      await request(server()).patch('/users/me/settings').set(auth(owner.accessToken)).send({ isProfilePublic: true }).expect(200);
      expect((await getProfile(stranger.accessToken, owner.userId).expect(200)).body.isPrivate).toBe(false);
      await request(server()).patch('/users/me/settings').set(auth(owner.accessToken)).send({ isProfilePublic: false }).expect(200);
      expect((await getProfile(stranger.accessToken, owner.userId).expect(200)).body.isPrivate).toBe(true);
    });

    it('staff reading through the admin console see everything (their route never goes through the filter)', async () => {
      const { owner } = await setup();
      const admin = await adminToken('moderator');
      const res = await request(server()).get(`/admin/users/${owner.userId}/summary`).set(auth(admin)).expect(200);
      expect(JSON.stringify(res.body)).toContain(owner.userId);
    });
  });

  // ---------------------------------------------------------------- follower / following lists

  describe('GET /users/:id/followers and /following', () => {
    it.each(['followers', 'following'])('%s: a stranger gets the same 404 a missing user gets; a follower and the owner get the list', async (which) => {
      const { owner, follower, stranger } = await setup();
      await follow(owner.userId, follower.userId); // so "following" has an entry too
      const missing = await request(server()).get(`/users/${MISSING_ID}/${which}`).set(auth(stranger.accessToken)).expect(404);
      const hidden = await request(server()).get(`/users/${owner.userId}/${which}`).set(auth(stranger.accessToken)).expect(404);
      expect(hidden.body).toEqual(missing.body);
      await request(server()).get(`/users/${owner.userId}/${which}`).set(auth(follower.accessToken)).expect(200);
      await request(server()).get(`/users/${owner.userId}/${which}`).set(auth(owner.accessToken)).expect(200);
    });

    it('follow then unfollow flips the lists, and a PUBLIC profile lists are open to a stranger as before', async () => {
      const { owner, stranger } = await setup();
      await request(server()).get(`/users/${owner.userId}/followers`).set(auth(stranger.accessToken)).expect(404);
      await follow(stranger.userId, owner.userId);
      const open = await request(server()).get(`/users/${owner.userId}/followers`).set(auth(stranger.accessToken)).expect(200);
      expect(open.body.items.map((i: { id: string }) => i.id)).toContain(stranger.userId);
      await unfollow(stranger.userId, owner.userId);
      await request(server()).get(`/users/${owner.userId}/followers`).set(auth(stranger.accessToken)).expect(404);
      await setPublic(owner.userId, true);
      await request(server()).get(`/users/${owner.userId}/followers`).set(auth(stranger.accessToken)).expect(200);
    });

    it('an under-18 owner (column forced false) keeps public lists, and a private owner still appears BY NAME in other people\'s lists', async () => {
      const stranger = await createUser('s');
      const minorOwner = await createMinor('owner', { isProfilePublic: false });
      await request(server()).get(`/users/${minorOwner.userId}/followers`).set(auth(stranger.accessToken)).expect(200);

      const privateOwner = await createUser('p', { isProfilePublic: false });
      const publicUser = await createUser('pub');
      await follow(privateOwner.userId, publicUser.userId);
      const list = await request(server()).get(`/users/${publicUser.userId}/followers`).set(auth(stranger.accessToken)).expect(200);
      // Identity necessarily appears: the public name only.
      expect(list.body.items).toEqual([{ id: privateOwner.userId, publicName: privateOwner.name }]);
    });
  });

  // ---------------------------------------------------------------- posts

  describe('single post, comments, reactions, views', () => {
    it('GET /posts/:id: owner and follower 200; a stranger gets the SAME 404 as a missing post; unfollowing hides it again', async () => {
      const { owner, follower, stranger, post } = await setup();
      await getPost(owner.accessToken, post.id).expect(200);
      await getPost(follower.accessToken, post.id).expect(200);
      const missing = await getPost(stranger.accessToken, MISSING_ID).expect(404);
      const hidden = await getPost(stranger.accessToken, post.id).expect(404);
      expect(hidden.body).toEqual(missing.body);
      await follow(stranger.userId, owner.userId);
      await getPost(stranger.accessToken, post.id).expect(200);
      await unfollow(stranger.userId, owner.userId);
      await getPost(stranger.accessToken, post.id).expect(404);
    });

    it('GET /posts/:id: an under-18 viewer is a stranger; an under-18 owner\'s posts are public', async () => {
      const { post } = await setup();
      const minorViewer = await createMinor('viewer');
      await getPost(minorViewer.accessToken, post.id).expect(404);
      const stranger = await createUser('s2');
      const minorOwner = await createMinor('owner', { isProfilePublic: false });
      const minorPost = await prisma().post.create({ data: { authorId: minorOwner.userId, contentText: 'minor post', mediaUrls: [] } });
      await getPost(stranger.accessToken, minorPost.id).expect(200);
    });

    it('GET /posts/:id/comments is a 404 to a stranger and open to a follower and the owner', async () => {
      const { owner, follower, stranger, post } = await setup();
      await request(server()).get(`/posts/${post.id}/comments`).set(auth(stranger.accessToken)).expect(404);
      await request(server()).get(`/posts/${post.id}/comments`).set(auth(follower.accessToken)).expect(200);
      await request(server()).get(`/posts/${post.id}/comments`).set(auth(owner.accessToken)).expect(200);
    });

    it('like, comment, save and view on a private post are the same 404 for a stranger, and write nothing (no row, no counter, no notification)', async () => {
      const { owner, stranger, post } = await setup();
      const t = stranger.accessToken;
      await request(server()).post(`/posts/${post.id}/like`).set(auth(t)).expect(404);
      await request(server()).post(`/posts/${post.id}/comments`).set(auth(t)).send({ contentText: 'hi' }).expect(404);
      await request(server()).post(`/posts/${post.id}/save`).set(auth(t)).expect(404);
      await request(server()).post(`/posts/${post.id}/view`).set(auth(t)).expect(404);
      await request(server()).post(`/posts/${post.id}/view`).expect(404); // anonymous
      await request(server()).post(`/posts/${post.id}/view-heartbeat`).set(auth(t)).send({ sessionId: '11111111-1111-4111-8111-111111111111', active: true, durationSeconds: 10 }).expect(404);

      const fresh = await prisma().post.findUniqueOrThrow({ where: { id: post.id } });
      expect(fresh.likeCount).toBe(0);
      expect(fresh.commentCount).toBe(0);
      expect(fresh.viewCount).toBe(0);
      expect(await prisma().like.count()).toBe(0);
      expect(await prisma().comment.count()).toBe(0);
      expect(await prisma().savedPost.count()).toBe(0);
      expect(await prisma().postView.count()).toBe(0);
      expect(await prisma().notification.count({ where: { userId: owner.userId } })).toBe(0);
    });

    it('a follower can still like, comment and save (following is instant, and then it is all visible)', async () => {
      const { follower, post } = await setup();
      const t = follower.accessToken;
      await request(server()).post(`/posts/${post.id}/like`).set(auth(t)).expect(200);
      await request(server()).post(`/posts/${post.id}/comments`).set(auth(t)).send({ contentText: 'hi' }).expect(201);
      await request(server()).post(`/posts/${post.id}/save`).set(auth(t)).expect(200);
    });

    it('a blocked pair is unchanged: a follower the owner blocked still gets the plain 404', async () => {
      const { owner, follower, post } = await setup();
      await prisma().follow.deleteMany({});
      await block(owner.userId, follower.userId);
      await getPost(follower.accessToken, post.id).expect(404);
    });
  });

  describe('feeds', () => {
    const ids = (body: { items: Array<{ id: string }> }) => body.items.map((i) => i.id);

    it('GET /clubs/:id/feed hides a private author\'s club post from a stranger, shows it to a follower and the owner', async () => {
      const { owner, follower, stranger, club, clubPost } = await setup();
      const feed = (t: string) => request(server()).get(`/clubs/${club.id}/feed`).set(auth(t)).expect(200);
      expect(ids((await feed(stranger.accessToken)).body)).not.toContain(clubPost.id);
      expect(ids((await feed(follower.accessToken)).body)).toContain(clubPost.id);
      expect(ids((await feed(owner.accessToken)).body)).toContain(clubPost.id);
      await follow(stranger.userId, owner.userId);
      expect(ids((await feed(stranger.accessToken)).body)).toContain(clubPost.id);
    });

    it('GET /posts/feed shows the follower the private owner\'s posts and stops when they unfollow', async () => {
      const { owner, follower, post } = await setup();
      const feed = () => request(server()).get('/posts/feed').set(auth(follower.accessToken)).expect(200);
      expect(ids((await feed()).body)).toContain(post.id);
      await unfollow(follower.userId, owner.userId);
      expect(ids((await feed()).body)).not.toContain(post.id);
    });

    it('Banter Room posts are NOT hidden: a room is an open public forum (B-117), whatever the author\'s setting', async () => {
      const { room, roomPost, stranger } = await setup();
      const feed = await request(server()).get(`/banter-rooms/${room.id}/posts`).set(auth(stranger.accessToken)).expect(200);
      expect(ids(feed.body)).toContain(roomPost.id);
      await getPost(stranger.accessToken, roomPost.id).expect(200);
      await request(server()).post(`/posts/${roomPost.id}/like`).set(auth(stranger.accessToken)).expect(200);
    });

    it('Contest entries are unaffected: an entry post by a private author is readable by a stranger', async () => {
      const { owner, stranger } = await setup();
      const cycle = await prisma().contestCycle.create({
        data: { title: 'C', startsAt: new Date('2026-01-01'), endsAt: new Date('2026-02-01') },
      });
      const round = await prisma().contestRound.create({
        data: { cycleId: cycle.id, weekNumber: 1, opensAt: new Date('2026-01-01'), closesAt: new Date('2026-01-08') },
      });
      const entryPost = await prisma().post.create({ data: { authorId: owner.userId, contentText: 'entry', mediaUrls: [] } });
      await prisma().contestEntry.create({ data: { cycleId: cycle.id, roundId: round.id, postId: entryPost.id, userId: owner.userId } });
      await getPost(stranger.accessToken, entryPost.id).expect(200);
    });
  });

  describe('search', () => {
    const postIds = (body: { posts?: { items: Array<{ id: string }> }; items?: Array<{ id: string }> }) =>
      (body.posts?.items ?? body.items ?? []).map((i) => i.id);

    it('post search hides a private author\'s posts from a stranger and from an anonymous searcher; follower and owner find them', async () => {
      const { owner, follower, stranger, post, clubPost, roomPost } = await setup();
      const search = (t?: string) => {
        const r = request(server()).get('/search').query({ q: NEEDLE, scope: 'posts' });
        return (t ? r.set(auth(t)) : r).expect(200);
      };
      const forStranger = postIds((await search(stranger.accessToken)).body);
      expect(forStranger).not.toContain(post.id);
      expect(forStranger).not.toContain(clubPost.id);
      expect(forStranger).toContain(roomPost.id); // Banter is exempt
      const anonymous = postIds((await search()).body);
      expect(anonymous).not.toContain(post.id);
      expect(anonymous).toContain(roomPost.id);
      expect(postIds((await search(follower.accessToken)).body)).toEqual(expect.arrayContaining([post.id, clubPost.id, roomPost.id]));
      expect(postIds((await search(owner.accessToken)).body)).toEqual(expect.arrayContaining([post.id, clubPost.id, roomPost.id]));
    });

    it('people search still finds the private owner by public name: identity is kept', async () => {
      const { owner, stranger } = await setup();
      const res = await request(server()).get('/search').query({ q: owner.name, scope: 'users' }).set(auth(stranger.accessToken)).expect(200);
      const users = (res.body.users?.items ?? res.body.items) as Array<{ id: string; publicName: string }>;
      expect(users).toEqual([{ id: owner.userId, publicName: owner.name }]);
    });
  });

  describe('saved posts', () => {
    it('a post saved while following disappears from the saver\'s list when they unfollow (never the text), and returns on re-follow; other people\'s lists stay 403', async () => {
      const { owner, follower, stranger, post } = await setup();
      await prisma().savedPost.create({ data: { userId: follower.userId, postId: post.id } });
      const list = () => request(server()).get(`/users/${follower.userId}/saved-posts`).set(auth(follower.accessToken)).expect(200);
      expect((await list()).body.items.map((e: { post: { id: string } }) => e.post.id)).toEqual([post.id]);
      await unfollow(follower.userId, owner.userId);
      const hidden = await list();
      expect(hidden.body.items).toEqual([]);
      expect(JSON.stringify(hidden.body)).not.toContain(NEEDLE);
      await follow(follower.userId, owner.userId);
      expect((await list()).body.items).toHaveLength(1);
      // IDOR: nobody reads somebody else's saved list.
      await request(server()).get(`/users/${follower.userId}/saved-posts`).set(auth(stranger.accessToken)).expect(403);
    });
  });

  describe('comments written by a private owner on someone else\'s post', () => {
    it('stay visible to a stranger (adopted default, listed as a known gap)', async () => {
      const { owner, stranger } = await setup();
      const author = await createUser('author');
      const publicPost = await prisma().post.create({ data: { authorId: author.userId, contentText: 'public post', mediaUrls: [] } });
      await prisma().comment.create({ data: { postId: publicPost.id, authorId: owner.userId, contentText: 'a comment by the private owner' } });
      const res = await request(server()).get(`/posts/${publicPost.id}/comments`).set(auth(stranger.accessToken)).expect(200);
      expect(res.body.items.map((c: { contentText: string }) => c.contentText)).toEqual(['a comment by the private owner']);
    });
  });

  // ---------------------------------------------------------------- settings

  describe('GET / PATCH /users/me/settings', () => {
    it('the default is public and the setting round-trips, stored on the caller\'s own row only', async () => {
      const u = await createUser('own');
      const get = await request(server()).get('/users/me/settings').set(auth(u.accessToken)).expect(200);
      expect(get.body).toMatchObject({ isProfilePublic: true });
      const patch = await request(server()).patch('/users/me/settings').set(auth(u.accessToken)).send({ isProfilePublic: false }).expect(200);
      expect(patch.body).toMatchObject({ isProfilePublic: false });
      expect((await prisma().user.findUniqueOrThrow({ where: { id: u.userId } })).isProfilePublic).toBe(false);
    });

    it('rejects a non-boolean or null with 400 and writes nothing; no other id can be named (IDOR: the subject is the token)', async () => {
      const u = await createUser('own');
      const other = await createUser('other');
      for (const body of [{ isProfilePublic: 'no' }, { isProfilePublic: null }, { isProfilePublic: 0 }]) {
        await request(server()).patch('/users/me/settings').set(auth(u.accessToken)).send(body).expect(400);
      }
      // A body cannot carry a target id (whitelist + forbidNonWhitelisted), so one user cannot flip another's setting.
      await request(server()).patch('/users/me/settings').set(auth(u.accessToken)).send({ isProfilePublic: false, userId: other.userId }).expect(400);
      await request(server()).patch('/users/me/settings').set(auth(u.accessToken)).send({ isProfilePublic: false, id: other.userId }).expect(400);
      expect((await prisma().user.findUniqueOrThrow({ where: { id: u.userId } })).isProfilePublic).toBe(true);
      expect((await prisma().user.findUniqueOrThrow({ where: { id: other.userId } })).isProfilePublic).toBe(true);
      await request(server()).patch('/users/me/settings').send({ isProfilePublic: false }).expect(401);
    });

    it('an under-18 account gets 403 profile_visibility_not_available for ANY value, with nothing written (not even the other fields of the request)', async () => {
      const minor = await createMinor('own');
      for (const value of [false, true]) {
        const res = await request(server())
          .patch('/users/me/settings')
          .set(auth(minor.accessToken))
          .send({ isProfilePublic: value, dmPermission: 'none' })
          .expect(403);
        expect(res.body.code).toBe('profile_visibility_not_available');
      }
      const row = await prisma().user.findUniqueOrThrow({ where: { id: minor.userId } });
      expect(row.isProfilePublic).toBe(true);
      expect(row.dmPermission).toBe('everyone');
      // Other settings still work for the same account.
      await request(server()).patch('/users/me/settings').set(auth(minor.accessToken)).send({ dmPermission: 'none' }).expect(200);
    });

    it('an under-18 account reads its EFFECTIVE value: true, even if the column holds false (e.g. an adult later reclassified as a minor)', async () => {
      const minor = await createMinor('eff', { isProfilePublic: false });
      const res = await request(server()).get('/users/me/settings').set(auth(minor.accessToken)).expect(200);
      expect(res.body.isProfilePublic).toBe(true);
    });

    it('sends no notification and writes no audit entry when the setting changes', async () => {
      const u = await createUser('quiet');
      await follow((await createUser('f')).userId, u.userId);
      const before = { notifications: await prisma().notification.count(), audit: await prisma().adminActionLog.count() };
      await request(server()).patch('/users/me/settings').set(auth(u.accessToken)).send({ isProfilePublic: false }).expect(200);
      await request(server()).patch('/users/me/settings').set(auth(u.accessToken)).send({ isProfilePublic: true }).expect(200);
      expect({ notifications: await prisma().notification.count(), audit: await prisma().adminActionLog.count() }).toEqual(before);
    });
  });

  describe('anonymisation', () => {
    it('resets the setting to public, so the surviving posts of an anonymised account stay readable as "[deleted user]"', async () => {
      const { owner, stranger, post } = await setup();
      await getPost(stranger.accessToken, post.id).expect(404);
      await prisma().user.update({ where: { id: owner.userId }, data: { accountStatus: 'pending_deletion', pendingDeletionAt: new Date(Date.now() - 40 * 24 * 3600 * 1000) } });
      const result = await app.get(AccountDeletionSweepService).sweepPendingDeletions(new Date());
      expect(result.anonymizedUserIds).toContain(owner.userId);
      expect((await prisma().user.findUniqueOrThrow({ where: { id: owner.userId } })).isProfilePublic).toBe(true);
      await getPost(stranger.accessToken, post.id).expect(200);
    });
  });
});
