import * as path from 'path';

// One place that knows where everything lives. The suite starts a REAL
// services/api against a REAL Postgres + Redis, plus the real apps/web and
// apps/admin Vite dev servers. Nothing on the network path is mocked.
export const REPO = path.resolve(__dirname, '..', '..');
export const RUN_DIR = path.resolve(__dirname, '..', '.run');

// `api` is the real services/api; the browsers talk to it directly (the CORS
// proxy this suite used before QA defect D-01 was fixed is gone).
export const PORTS = { api: 3100, web: 5273, admin: 5274 } as const;

// FC10 (B-240): the stand-ins for the object store and for Amazon Rekognition (support/fake-media-services.ts).
export const FAKE_MEDIA = { storage: 'http://localhost:3191', rekognition: 'http://localhost:3192', bucket: 'qa-media' } as const;
export const URLS = {
  api: `http://localhost:${PORTS.api}`,
  web: `http://localhost:${PORTS.web}`,
  admin: `http://localhost:${PORTS.admin}`,
} as const;

export const API_LOG = path.join(RUN_DIR, 'api.log');

// A dedicated database + Redis logical DB so a QA run never touches the
// developer's own `soccernity` data.
export const QA_DB_NAME = 'soccernity_qa';
export const QA_REDIS_DB = 5;

export const ADMIN_CREDENTIALS = {
  email: 'qa-superadmin@soccernity.test',
  password: 'QaAdmin#2026-pass',
  fullName: 'QA Superadmin',
};

// Password used by every account the tests register.
export const USER_PASSWORD = 'Sup3r-secret-pass';

// Only the host/credentials of the root .env URL are reused; the database
// name is always the QA one above.
export function qaDatabaseUrl(baseUrl: string): string {
  const u = new URL(baseUrl);
  u.pathname = `/${QA_DB_NAME}`;
  u.search = '';
  return u.toString();
}
