import * as webpush from 'web-push';
import { PUSH_TTL_SECONDS } from './push.constants';
import { PushSendError, WebPushLibSender } from './web-push-sender';

jest.mock('web-push', () => ({ sendNotification: jest.fn() }));

const VAPID = { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:support@soccernity.com' };
const TARGET = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'p256', auth: 'authkey' };

// The one spec that touches the web-push library (mocked: no network, no real keys).
describe('WebPushLibSender', () => {
  const sendNotification = webpush.sendNotification as unknown as jest.Mock;
  beforeEach(() => sendNotification.mockReset());

  it('passes the subscription, the payload text and the VAPID details to the library', async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });
    await new WebPushLibSender().send(TARGET, 'payload-text', VAPID);
    expect(sendNotification).toHaveBeenCalledWith(
      { endpoint: TARGET.endpoint, keys: { p256dh: 'p256', auth: 'authkey' } },
      'payload-text',
      {
        vapidDetails: { subject: VAPID.subject, publicKey: 'pub', privateKey: 'priv' },
        TTL: PUSH_TTL_SECONDS,
        urgency: 'normal',
      },
    );
  });

  it('turns a library error into a PushSendError carrying only the status code', async () => {
    const libError = Object.assign(new Error(`Received unexpected response code for ${TARGET.endpoint}`), {
      statusCode: 410,
      endpoint: TARGET.endpoint,
      headers: { secret: 'x' },
    });
    sendNotification.mockRejectedValue(libError);
    const err = await new WebPushLibSender().send(TARGET, 'p', VAPID).catch((e) => e);
    expect(err).toBeInstanceOf(PushSendError);
    expect(err.statusCode).toBe(410);
    expect(JSON.stringify(err)).not.toContain('fcm.googleapis.com');
    expect(err.message).not.toContain('fcm.googleapis.com');
  });

  it('uses a null status for a failure without one (network, bad keys)', async () => {
    sendNotification.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
    const err = await new WebPushLibSender().send(TARGET, 'p', VAPID).catch((e) => e);
    expect(err).toBeInstanceOf(PushSendError);
    expect(err.statusCode).toBeNull();
  });
});
