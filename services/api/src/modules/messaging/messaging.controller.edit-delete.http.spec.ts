import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProfileCompleteGuard } from '../auth/guards/profile-complete.guard';
import { Under16RestrictionGuard } from '../auth/guards/under-16-restriction.guard';
import { ConversationsController } from './conversations.controller';
import { MessagingService } from './messaging.service';

// backend/b067-message-edit-delete-hide (B-067). The HTTP layer of the three new routes: routing, DTO and query
// validation, status codes, and which guards run on which route. The service is mocked; its rules are covered
// in messaging.service.edit-delete.spec.ts. messaging.controller.http.spec.ts is deliberately untouched.
describe('ConversationsController: edit, delete and hide (HTTP layer)', () => {
  let app: INestApplication;
  const CALLER = { sub: 'user-1', role: 'fan' };
  let consentCalls = 0;
  let emailCalls = 0;
  let profileCalls = 0;

  const messaging = {
    editMessage: jest.fn(),
    deleteMessage: jest.fn(),
    deleteConversation: jest.fn(),
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
      .useValue({ canActivate: () => ((consentCalls += 1), true) })
      .overrideGuard(EmailVerifiedGuard)
      .useValue({ canActivate: () => ((emailCalls += 1), true) })
      .overrideGuard(ProfileCompleteGuard)
      .useValue({ canActivate: () => ((profileCalls += 1), true) })
      .overrideGuard(Under16RestrictionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
    consentCalls = 0;
    emailCalls = 0;
    profileCalls = 0;
  });

  describe('PATCH /conversations/:id/messages/:messageId', () => {
    it('edits: 200 with the message, delegating editMessage(conversation, message, caller, dto); runs consent, verified-email and profile guards', async () => {
      messaging.editMessage.mockResolvedValue({ id: 'm-1', contentText: 'fixed', editedAt: '2026-11-15T10:03:00.000Z' });
      const res = await request(app.getHttpServer())
        .patch('/conversations/c-1/messages/m-1')
        .send({ contentText: 'fixed' })
        .expect(200);
      expect(res.body).toEqual({ id: 'm-1', contentText: 'fixed', editedAt: '2026-11-15T10:03:00.000Z' });
      expect(messaging.editMessage).toHaveBeenCalledWith('c-1', 'm-1', 'user-1', { contentText: 'fixed' });
      expect([consentCalls, emailCalls, profileCalls]).toEqual([1, 1, 1]);
    });

    it('applies the same text bounds as a send: empty (400), 3001 characters (400), 3000 accepted', async () => {
      messaging.editMessage.mockResolvedValue({ id: 'm-1' });
      await request(app.getHttpServer()).patch('/conversations/c-1/messages/m-1').send({ contentText: '' }).expect(400);
      await request(app.getHttpServer())
        .patch('/conversations/c-1/messages/m-1')
        .send({ contentText: 'x'.repeat(3001) })
        .expect(400);
      await request(app.getHttpServer())
        .patch('/conversations/c-1/messages/m-1')
        .send({ contentText: 'x'.repeat(3000) })
        .expect(200);
    });

    it('rejects a missing body, a non-string, and any extra field (a smuggled senderId, editedAt, originalContentText or mediaUrl)', async () => {
      const patch = () => request(app.getHttpServer()).patch('/conversations/c-1/messages/m-1');
      await patch().send({}).expect(400);
      await patch().send({ contentText: 42 }).expect(400);
      await patch().send({ contentText: 'x', senderId: 'someone' }).expect(400);
      await patch().send({ contentText: 'x', editedAt: '2026-01-01T00:00:00Z' }).expect(400);
      await patch().send({ contentText: 'x', originalContentText: 'y' }).expect(400);
      await patch().send({ contentText: 'x', mediaUrl: 'https://example.com/a.jpg' }).expect(400);
      expect(messaging.editMessage).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /conversations/:id/messages/:messageId', () => {
    it.each(['me', 'everyone'] as const)('scope=%s: 204, delegating deleteMessage with the scope; consent guard only', async (scope) => {
      messaging.deleteMessage.mockResolvedValue(undefined);
      const res = await request(app.getHttpServer())
        .delete(`/conversations/c-1/messages/m-1?scope=${scope}`)
        .expect(204);
      expect(res.body).toEqual({});
      expect(messaging.deleteMessage).toHaveBeenCalledWith('c-1', 'm-1', 'user-1', scope);
      expect([consentCalls, emailCalls, profileCalls]).toEqual([1, 0, 0]);
    });

    it('requires the scope: missing, empty or unknown is a 400 and the service is never called', async () => {
      const del = (qs: string) => request(app.getHttpServer()).delete(`/conversations/c-1/messages/m-1${qs}`);
      await del('').expect(400);
      await del('?scope=').expect(400);
      await del('?scope=all').expect(400);
      await del('?scope=ME').expect(400);
      expect(messaging.deleteMessage).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /conversations/:id', () => {
    it('deletes the chat for the caller: 204, delegating deleteConversation(id, caller); consent guard only', async () => {
      messaging.deleteConversation.mockResolvedValue(undefined);
      await request(app.getHttpServer()).delete('/conversations/c-1').expect(204);
      expect(messaging.deleteConversation).toHaveBeenCalledWith('c-1', 'user-1');
      expect([consentCalls, emailCalls, profileCalls]).toEqual([1, 0, 0]);
      expect(messaging.deleteMessage).not.toHaveBeenCalled();
    });
  });
});
