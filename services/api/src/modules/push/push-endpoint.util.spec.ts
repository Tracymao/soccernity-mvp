import { isAllowedPushEndpoint } from './push-endpoint.util';

describe('isAllowedPushEndpoint', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/abc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
    'https://FCM.GOOGLEAPIS.COM/fcm/send/abc',
  ])('accepts %s', (endpoint) => expect(isAllowedPushEndpoint(endpoint)).toBe(true));

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc', // not https
    'https://example.com/push',
    'https://fcm.googleapis.com.example.com/x',
    'https://xfcm.googleapis.com/x', // suffix without the dot boundary
    'https://localhost/push',
    'https://127.0.0.1/push',
    'https://169.254.169.254/latest/meta-data',
    'https://fcm.googleapis.com:8443/x', // non-default port
    'https://user:pass@fcm.googleapis.com/x',
    'not a url',
    '',
  ])('refuses %j', (endpoint) => expect(isAllowedPushEndpoint(endpoint)).toBe(false));
});
