import { Injectable } from '@nestjs/common';
import * as webpush from 'web-push';
import { PUSH_TTL_SECONDS } from './push.constants';
import { VapidDetails } from './push.config';

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** What the sweep needs to know about a failed send: the HTTP status only (never the endpoint, keys or message). */
export class PushSendError extends Error {
  constructor(readonly statusCode: number | null) {
    super('push send failed');
    this.name = 'PushSendError';
  }
}

// The one place that touches the web-push library, behind an abstract class so the service and sweep specs can
// provide a fake and the library is mocked in exactly one spec.
export abstract class WebPushSender {
  /** Sends `payload` to one browser. Resolves on acceptance; throws PushSendError (status or null) on failure. */
  abstract send(target: PushTarget, payload: string, vapid: VapidDetails): Promise<void>;
}

@Injectable()
export class WebPushLibSender extends WebPushSender {
  async send(target: PushTarget, payload: string, vapid: VapidDetails): Promise<void> {
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        payload,
        {
          vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
          TTL: PUSH_TTL_SECONDS,
          urgency: 'normal',
        },
      );
    } catch (err) {
      // web-push's errors carry the endpoint and headers; keep ONLY the status code.
      const status = (err as { statusCode?: unknown })?.statusCode;
      throw new PushSendError(typeof status === 'number' ? status : null);
    }
  }
}
