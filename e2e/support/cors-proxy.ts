import * as http from 'http';

// TEST HARNESS ONLY. services/api calls `app.enableCors()` with no options,
// so it answers every preflight with `Access-Control-Allow-Origin: *`. A
// browser refuses that for a request sent with `credentials: "include"`, and
// apps/web's registerUser() sends exactly that -- so sign-up cannot complete
// from a browser at all (DEFECT D-01, see tests/00-known-defects.spec.ts).
//
// Product code must not change in this QA pass, so the browsers talk to this
// proxy instead, which forwards every byte to the real API unchanged and only
// rewrites the CORS response headers (reflect the origin, allow credentials).
// Nothing is mocked: the real API, Postgres and Redis sit behind it.
export function startCorsProxy(listenPort: number, targetPort: number): http.Server {
  const server = http.createServer((req, res) => {
    const origin = req.headers.origin;
    const cors: Record<string, string> = origin
      ? {
          'access-control-allow-origin': origin,
          'access-control-allow-credentials': 'true',
          vary: 'Origin',
        }
      : {};

    if (req.method === 'OPTIONS' && origin) {
      res.writeHead(204, {
        ...cors,
        'access-control-allow-methods': 'GET,HEAD,PUT,PATCH,POST,DELETE',
        'access-control-allow-headers': String(req.headers['access-control-request-headers'] ?? '*'),
        'access-control-max-age': '600',
      });
      res.end();
      return;
    }

    const upstream = http.request(
      { host: '127.0.0.1', port: targetPort, method: req.method, path: req.url, headers: req.headers },
      (up) => {
        const headers = { ...up.headers };
        delete headers['access-control-allow-origin'];
        res.writeHead(up.statusCode ?? 502, { ...headers, ...cors });
        up.pipe(res);
      },
    );
    upstream.on('error', () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  });
  server.listen(listenPort, '0.0.0.0');
  return server;
}
