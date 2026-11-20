import * as express from 'express';
import * as request from 'supertest';
import { applyTrustProxy, parseTrustProxyHops } from './trust-proxy';

describe('parseTrustProxyHops (B-024)', () => {
  it.each([
    ['1', 1],
    [' 2 ', 2],
    ['10', 10],
  ])('%p -> %p', (raw, expected) => {
    expect(parseTrustProxyHops(raw)).toBe(expected);
  });

  // Fail-safe: anything that is not a clear, small positive integer trusts NO
  // proxy -- never "true"/"all", which would let a client forge its own IP.
  it.each([[undefined], [null], [''], ['  '], ['0'], ['-1'], ['11'], ['true'], ['loopback'], ['1.5'], ['abc']])(
    '%p -> null (trust no proxy)',
    (raw) => {
      expect(parseTrustProxyHops(raw as string | undefined | null)).toBeNull();
    },
  );
});

describe('applyTrustProxy (B-024)', () => {
  function appWithIpEcho(raw: string | undefined) {
    const server = express();
    const nestLike = {
      getHttpAdapter: () => ({ getInstance: () => server }),
    };
    const hops = applyTrustProxy(nestLike as never, raw);
    server.get('/ip', (req, res) => res.json({ ip: req.ip }));
    return { server, hops };
  }

  it('with TRUST_PROXY_HOPS=1, req.ip is the client entry of X-Forwarded-For', async () => {
    const { server, hops } = appWithIpEcho('1');
    expect(hops).toBe(1);
    const res = await request(server).get('/ip').set('X-Forwarded-For', '203.0.113.9');
    expect(res.body.ip).toBe('203.0.113.9');
  });

  it('with 1 hop, extra left-hand entries a client forges are ignored (the proxy appends the real peer)', async () => {
    const { server } = appWithIpEcho('1');
    // client sent "1.1.1.1"; the (trusted) proxy appended the real client "203.0.113.9"
    const res = await request(server).get('/ip').set('X-Forwarded-For', '1.1.1.1, 203.0.113.9');
    expect(res.body.ip).toBe('203.0.113.9');
  });

  it('unset: no proxy is trusted, so a forged X-Forwarded-For is IGNORED (fail-safe)', async () => {
    const { server, hops } = appWithIpEcho(undefined);
    expect(hops).toBeNull();
    const res = await request(server).get('/ip').set('X-Forwarded-For', '203.0.113.9');
    expect(res.body.ip).not.toBe('203.0.113.9');
    expect(res.body.ip).toMatch(/127\.0\.0\.1|::1/);
  });
});
