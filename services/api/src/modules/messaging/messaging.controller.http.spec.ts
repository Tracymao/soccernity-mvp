import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConversationsController } from './conversations.controller';
import { MessagingService } from './messaging.service';

// Exercises the real HTTP layer: routing (that /:id/messages and
// /:id/read resolve), DTO validation, guard wiring, and the 201/200
// find-or-create status split — following
// banter.controller.http.spec.ts. Both guards are overridden; the
// consent guard counts its invocations so we can assert it's on exactly
// the two write routes (POST /conversations, POST
// /conversations/:id/messages) and NOT on the reads or the mark-read.
describe('ConversationsController (HTTP layer)', () => {
  let app: INestApplication;
  const CALLER = { sub: 'user-1', role: 'fan' };
  let consentGuardCalls = 0;

  const messaging = {
    startConversation: jest.fn(),
    listConversations: jest.fn(),
    getMessages: jest.fn(),
    sendMessage: jest.fn(),
    markConversationRead: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ConversationsController],
      providers: [{ provide: MessagingService, useValue: messaging }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = CALLER;
          return true;
        },
      })
      .overrideGuard(GuardianConsentGuard)
      .useValue({
        canActivate: () => {
          consentGuardCalls += 1;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
    consentGuardCalls = 0;
  });

  const RECIPIENT = '11111111-1111-4111-8111-111111111111';

  describe('POST /conversations', () => {
    it('returns 201 when a new conversation is created, delegating startConversation(caller, recipientId) — consent guard ran', async () => {
      messaging.startConversation.mockResolvedValue({ view: { id: 'c-1' }, created: true });
      const res = await request(app.getHttpServer())
        .post('/conversations')
        .send({ recipientId: RECIPIENT })
        .expect(201);

      expect(res.body).toEqual({ id: 'c-1' });
      expect(messaging.startConversation).toHaveBeenCalledWith('user-1', RECIPIENT);
      expect(consentGuardCalls).toBe(1);
    });

    it('returns 200 when an existing conversation is found', async () => {
      messaging.startConversation.mockResolvedValue({ view: { id: 'c-1' }, created: false });
      await request(app.getHttpServer())
        .post('/conversations')
        .send({ recipientId: RECIPIENT })
        .expect(200);
    });

    it('rejects a non-UUID recipientId with 400', async () => {
      await request(app.getHttpServer())
        .post('/conversations')
        .send({ recipientId: 'not-a-uuid' })
        .expect(400);
      expect(messaging.startConversation).not.toHaveBeenCalled();
    });

    it('rejects a missing recipientId with 400', async () => {
      await request(app.getHttpServer()).post('/conversations').send({}).expect(400);
    });

    it('strips extra body fields (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/conversations')
        .send({ recipientId: RECIPIENT, participantIds: ['x'], participantKey: 'y' })
        .expect(400);
    });
  });

  describe('GET /conversations', () => {
    it('passes cursor/limit through and does NOT run the consent guard', async () => {
      messaging.listConversations.mockResolvedValue({ items: [], nextCursor: null });
      await request(app.getHttpServer()).get('/conversations?limit=5&cursor=abc').expect(200);
      expect(messaging.listConversations).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ limit: 5, cursor: 'abc' }),
      );
      expect(consentGuardCalls).toBe(0);
    });

    it('rejects limit over 50 with 400', async () => {
      await request(app.getHttpServer()).get('/conversations?limit=51').expect(400);
    });
  });

  describe('GET + POST /conversations/:id/messages', () => {
    it('GET delegates to getMessages(id, caller, query) with no consent guard', async () => {
      messaging.getMessages.mockResolvedValue({ items: [], nextCursor: null });
      await request(app.getHttpServer()).get('/conversations/c-1/messages?limit=10').expect(200);
      expect(messaging.getMessages).toHaveBeenCalledWith(
        'c-1',
        'user-1',
        expect.objectContaining({ limit: 10 }),
      );
      expect(consentGuardCalls).toBe(0);
    });

    it('POST delegates to sendMessage(id, caller, dto) and runs the consent guard, 201', async () => {
      messaging.sendMessage.mockResolvedValue({ id: 'm-1' });
      await request(app.getHttpServer())
        .post('/conversations/c-1/messages')
        .send({ contentText: 'hello' })
        .expect(201);
      expect(messaging.sendMessage).toHaveBeenCalledWith('c-1', 'user-1', { contentText: 'hello' });
      expect(consentGuardCalls).toBe(1);
    });

    it('rejects an empty contentText (400) and a 3001-char one (400)', async () => {
      await request(app.getHttpServer())
        .post('/conversations/c-1/messages')
        .send({ contentText: '' })
        .expect(400);
      await request(app.getHttpServer())
        .post('/conversations/c-1/messages')
        .send({ contentText: 'x'.repeat(3001) })
        .expect(400);
    });

    it('rejects a non-URL mediaUrl (400) and strips a smuggled senderId (400)', async () => {
      await request(app.getHttpServer())
        .post('/conversations/c-1/messages')
        .send({ contentText: 'x', mediaUrl: 'not a url' })
        .expect(400);
      await request(app.getHttpServer())
        .post('/conversations/c-1/messages')
        .send({ contentText: 'x', senderId: 'someone-else' })
        .expect(400);
    });
  });

  describe('PATCH /conversations/:id/read', () => {
    it('returns 200, delegates to markConversationRead(id, caller), no consent guard', async () => {
      messaging.markConversationRead.mockResolvedValue({ conversationId: 'c-1', markedRead: 3 });
      const res = await request(app.getHttpServer())
        .patch('/conversations/c-1/read')
        .expect(200);
      expect(res.body).toEqual({ conversationId: 'c-1', markedRead: 3 });
      expect(messaging.markConversationRead).toHaveBeenCalledWith('c-1', 'user-1');
      expect(consentGuardCalls).toBe(0);
    });
  });
});
