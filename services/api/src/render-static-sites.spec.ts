import * as fs from 'fs';
import * as path from 'path';

// B-179 / B-088 drift guard for the two static sites (apps/web and apps/admin) that render.yaml defines per environment.
// Same style as env-completeness.spec.ts: read render.yaml as text and check the facts that, if they drifted, would ship
// a site that does not work or is not protected -- NOT a validation that Render accepts the file (no Render account
// exists; the field names were checked against Render's documentation on 2026-11-14, see docs/deployment.md).
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const yamlText = fs.readFileSync(path.join(REPO_ROOT, 'render.yaml'), 'utf8').replace(/\r\n/g, '\n');
const docsText = fs.readFileSync(path.join(REPO_ROOT, 'docs', 'deployment.md'), 'utf8');
const rootExample = fs.readFileSync(path.join(REPO_ROOT, '.env.example'), 'utf8');
const rootPackage = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

// Decided domain layout (Decision Log #437): one registrable domain, the host-only SameSite=Strict refresh cookie needs it.
const ORIGINS = {
  staging: {
    web: 'https://staging.soccernity.com',
    admin: 'https://admin.staging.soccernity.com',
    api: 'https://api.staging.soccernity.com',
  },
  production: {
    web: 'https://soccernity.com',
    admin: 'https://admin.soccernity.com',
    api: 'https://api.soccernity.com',
  },
} as const;

interface Header {
  path: string;
  name: string;
  value: string;
}
interface Service {
  name: string;
  chunk: string;
  runtime: string | undefined;
  branch: string | undefined;
}

function services(): Service[] {
  return yamlText
    .split(/^ {2}- type: web$/m)
    .slice(1)
    .map((chunk) => ({
      name: /^ {4}name: (\S+)$/m.exec(chunk)![1],
      chunk,
      runtime: /^ {4}runtime: (\S+)$/m.exec(chunk)?.[1],
      branch: /^ {4}branch: (\S+)$/m.exec(chunk)?.[1],
    }));
}

function envValue(chunk: string, key: string): string | undefined {
  const m = new RegExp(`^ {6}- key: ${key}\\n {8}(?:value: (.*)|sync: false)$`, 'm').exec(chunk);
  if (!m) return undefined;
  return m[1] === undefined ? 'sync: false' : m[1].replace(/^"|"$/g, '');
}

function headers(chunk: string): Header[] {
  return [...chunk.matchAll(/^ {6}- path: (\S+)\n {8}name: (\S+)\n {8}value: (.*)$/gm)].map((m) => ({
    path: m[1],
    name: m[2],
    value: m[3].replace(/^"|"$/g, ''),
  }));
}

function directives(csp: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const part of csp.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) out.set(name, values);
  }
  return out;
}

const all = services();
const byName = new Map(all.map((s) => [s.name, s]));
const SITES = [
  { env: 'staging', app: 'web', name: 'soccernity-web-staging', api: 'soccernity-api-staging' },
  { env: 'staging', app: 'admin', name: 'soccernity-admin-staging', api: 'soccernity-api-staging' },
  { env: 'production', app: 'web', name: 'soccernity-web', api: 'soccernity-api' },
  { env: 'production', app: 'admin', name: 'soccernity-admin', api: 'soccernity-api' },
] as const;

describe('render.yaml static sites (B-179)', () => {
  it('defines exactly the API, web and admin services for each environment (six services)', () => {
    expect(all.map((s) => s.name).sort()).toEqual(
      [
        'soccernity-admin',
        'soccernity-admin-staging',
        'soccernity-api',
        'soccernity-api-staging',
        'soccernity-web',
        'soccernity-web-staging',
      ].sort(),
    );
    expect(all.filter((s) => s.runtime === 'static')).toHaveLength(4);
  });

  describe.each(SITES)('$name', ({ env, app, name, api }) => {
    const site = byName.get(name)!;
    const origins = ORIGINS[env];
    const hs = headers(site.chunk);
    const csp = hs.find((h) => h.name === 'Content-Security-Policy' && h.path === '/*')!;

    it('is a static site on the same branch as its environment API service, with no region and no plan', () => {
      expect(site.runtime).toBe('static');
      expect(site.branch).toBe(byName.get(api)!.branch);
      expect(site.branch).toBe(env === 'staging' ? 'staging' : 'main');
      // Render documents both as unsupported for static sites; setting them would be a Blueprint error.
      expect(site.chunk).not.toMatch(/^ {4}region:/m);
      expect(site.chunk).not.toMatch(/^ {4}plan:/m);
      expect(site.chunk).not.toMatch(/^ {4}startCommand:/m);
    });

    it('builds from the repo root and publishes that app dist folder', () => {
      expect(site.chunk).toMatch(new RegExp(`^ {4}staticPublishPath: \\./apps/${app}/dist$`, 'm'));
      const build = /^ {4}buildCommand: (.*)$/m.exec(site.chunk)![1];
      if (env === 'production') {
        // The release build runs the pending-copy check on BOTH dist folders, so either site fails to build while
        // tagged copy would ship.
        expect(build).toBe('npm install && npm run build:release');
      } else {
        expect(build).toBe(`npm install && npm run build --workspace=apps/${app}`);
        expect(build).not.toContain('build:release');
        expect(build).not.toContain('check:pending-copy');
      }
    });

    it('rewrites every non-file path to /index.html (single-page app)', () => {
      expect(site.chunk).toMatch(/^ {4}routes:\n {6}- type: rewrite\n {8}source: \/\*\n {8}destination: \/index\.html$/m);
    });

    it('gets the API origin at build time, equal to the API origin in connect-src and to the layout decided in #437', () => {
      expect(envValue(site.chunk, 'VITE_API_BASE_URL')).toBe(origins.api);
      expect(origins.api.startsWith('https://')).toBe(true);
      expect(directives(csp.value).get('connect-src')).toContain(origins.api);
      // Nothing else that looks like an API origin of the other environment leaks into this site's policy.
      const other = ORIGINS[env === 'staging' ? 'production' : 'staging'].api;
      expect(csp.value).not.toContain(other + ' ');
    });

    it('sends the security headers on every path', () => {
      for (const n of ['Content-Security-Policy', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy']) {
        expect(hs.some((h) => h.path === '/*' && h.name === n)).toBe(true);
      }
      expect(hs.find((h) => h.name === 'X-Content-Type-Options')!.value).toBe('nosniff');
      expect(hs.find((h) => h.name === 'Referrer-Policy')!.value).toBe('no-referrer');
      const hsts = hs.find((h) => h.name === 'Strict-Transport-Security');
      if (env === 'production') expect(hsts?.value).toBe('max-age=31536000; includeSubDomains');
      else expect(hsts).toBeUndefined();
    });

    it('has a strict CSP: no inline or eval script, nothing framing the site, deny by default', () => {
      const d = directives(csp.value);
      expect(d.get('default-src')).toEqual(["'none'"]);
      expect(d.get('frame-ancestors')).toEqual(["'none'"]);
      expect(d.get('object-src')).toEqual(["'none'"]);
      expect(d.get('base-uri')).toEqual(["'none'"]);
      expect(d.get('form-action')).toEqual(["'self'"]);
      expect(d.get('script-src')).toContain("'self'");
      expect(csp.value).not.toContain("'unsafe-inline'");
      expect(csp.value).not.toContain("'unsafe-eval'");
      // Both apps self-host their fonts now (fontsource), so no font or style CDN is allowed.
      expect(d.get('style-src')).toEqual(["'self'"]);
      expect(d.get('font-src')).toEqual(["'self'"]);
      expect(csp.value).not.toMatch(/googleapis|gstatic/);
    });

    if (app === 'web') {
      it('web: allows Stripe (card step only), blob/data previews, the service worker, and storage origins', () => {
        const d = directives(csp.value);
        expect(d.get('script-src')).toEqual(
          expect.arrayContaining(['https://js.stripe.com', 'https://*.js.stripe.com']),
        );
        expect(d.get('frame-src')).toEqual(
          expect.arrayContaining(['https://js.stripe.com', 'https://*.js.stripe.com', 'https://hooks.stripe.com']),
        );
        expect(d.get('connect-src')).toEqual(
          expect.arrayContaining(['https://api.stripe.com', 'https://*.r2.cloudflarestorage.com']),
        );
        // Each environment has its own media host (Decision Log #535).
        const media = env === 'staging' ? 'https://media.staging.soccernity.com' : 'https://media.soccernity.com';
        expect(d.get('connect-src')).toEqual(expect.arrayContaining(['https://*.eu.r2.cloudflarestorage.com']));
        expect(d.get('img-src')).toEqual(expect.arrayContaining(['data:', 'blob:', media]));
        expect(d.get('media-src')).toEqual(expect.arrayContaining(["'self'", media]));
        expect(d.get('worker-src')).toEqual(["'self'"]);
      });

      it('web: serves /sw.js with Cache-Control: no-cache', () => {
        expect(hs).toContainEqual({ path: '/sw.js', name: 'Cache-Control', value: 'no-cache' });
      });
    } else {
      it('admin: no Stripe, no frames, no service worker rule; storage origins for the review queue links', () => {
        const d = directives(csp.value);
        expect(csp.value).not.toContain('stripe');
        expect(d.get('frame-src')).toEqual(["'none'"]);
        expect(d.get('script-src')).toEqual(["'self'"]);
        expect(d.get('connect-src')).toEqual(["'self'", origins.api]);
        // The review queue plays a 5-minute signed link on the S3 endpoint, so admin needs that origin too.
        const media = env === 'staging' ? 'https://media.staging.soccernity.com' : 'https://media.soccernity.com';
        expect(d.get('img-src')).toEqual(expect.arrayContaining(['data:', media, 'https://*.r2.cloudflarestorage.com', 'https://*.eu.r2.cloudflarestorage.com']));
        expect(d.get('media-src')).toEqual(expect.arrayContaining([media, 'https://*.r2.cloudflarestorage.com', 'https://*.eu.r2.cloudflarestorage.com']));
        expect(hs.some((h) => h.path === '/sw.js')).toBe(false);
      });
    }
  });

  it('the API origin variables name the same web and admin origins the static sites are built for', () => {
    for (const env of ['staging', 'production'] as const) {
      const apiName = env === 'staging' ? 'soccernity-api-staging' : 'soccernity-api';
      const chunk = byName.get(apiName)!.chunk;
      expect(envValue(chunk, 'WEB_APP_BASE_URL')).toBe(ORIGINS[env].web);
      expect(envValue(chunk, 'ADMIN_APP_BASE_URL')).toBe(ORIGINS[env].admin);
      // The API's own public address is the one the sites are built against.
      expect(envValue(byName.get(env === 'staging' ? 'soccernity-web-staging' : 'soccernity-web')!.chunk, 'VITE_API_BASE_URL')).toBe(
        ORIGINS[env].api,
      );
    }
    // Staging and production never share an origin.
    const flat = [...Object.values(ORIGINS.staging), ...Object.values(ORIGINS.production)];
    expect(new Set(flat).size).toBe(flat.length);
  });

  it('keeps the pending-copy gate in the production build path and out of staging', () => {
    expect(rootPackage.scripts['check:pending-copy']).toBeDefined();
    expect(rootPackage.scripts['build:release']).toContain('--workspace=apps/web');
    expect(rootPackage.scripts['build:release']).toContain('--workspace=apps/admin');
    expect(rootPackage.scripts['build:release']).toContain('check:pending-copy');
    expect(all.filter((s) => s.chunk.includes('build:release')).map((s) => s.name).sort()).toEqual([
      'soccernity-admin',
      'soccernity-web',
    ]);
  });

  // Every origin variable the headers or the build rely on must be documented where a human looks for it.
  describe('origin variables are documented', () => {
    const webExample = fs.readFileSync(path.join(REPO_ROOT, 'apps', 'web', '.env.example'), 'utf8');
    const adminExample = fs.readFileSync(path.join(REPO_ROOT, 'apps', 'admin', '.env.example'), 'utf8');

    it.each(['S3_ENDPOINT', 'S3_PUBLIC_BASE_URL', 'WEB_APP_BASE_URL', 'ADMIN_APP_BASE_URL'])(
      '%s is in .env.example and in docs/deployment.md',
      (name) => {
        expect(rootExample).toContain(`${name}=`);
        expect(docsText).toContain(name);
      },
    );

    it('VITE_API_BASE_URL is in both apps .env.example and in docs/deployment.md', () => {
      expect(webExample).toContain('VITE_API_BASE_URL=');
      expect(adminExample).toContain('VITE_API_BASE_URL=');
      expect(docsText).toContain('VITE_API_BASE_URL');
    });

    it('docs/deployment.md has a section per site and says what is not verified', () => {
      for (const n of ['soccernity-web-staging', 'soccernity-admin-staging', 'soccernity-web', 'soccernity-admin']) {
        expect(docsText).toContain(n);
      }
      expect(docsText).toMatch(/Static sites/);
      expect(docsText).toMatch(/NOT verified/i);
      expect(docsText).toContain('/sw.js');
    });
  });
});
