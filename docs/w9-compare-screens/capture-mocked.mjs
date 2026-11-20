// W9 (B-174, B-175): real-Chrome captures of the verify-email prompt (390px, three states) and the Club
// Picker (desktop + 390px, populated states) WITHOUT the database: it starts the apps/web Vite dev server
// and answers every API call in the browser (page.route). Used because the QA stack (Docker Postgres) was
// not available; the e2e spec 10-screenshots.spec.ts (w9 capture) is the real-stack version.
//
//   node docs/w9-compare-screens/capture-mocked.mjs before|after
//
// Run from the repo root. Output: docs/w9-compare-screens/real/<phase>/*.png and measured boxes in
// docs/w9-compare-screens/real/<phase>/measure.json
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const phase = process.argv[2] ?? "after";
const OUT = path.join(HERE, "real", phase);
fs.mkdirSync(OUT, { recursive: true });
const require = createRequire(path.join(ROOT, "e2e", "package.json"));
const { chromium } = require("@playwright/test");

const PORT = 5291;
const API = "http://localhost:3000";
const base64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const TOKEN = `${base64url({ alg: "none" })}.${base64url({ sub: "11111111-1111-4111-8111-111111111111", role: "user" })}.sig`;

const vite = spawn(process.execPath, [path.join(ROOT, "apps", "web", "node_modules", "vite", "bin", "vite.js"), "--port", String(PORT), "--strictPort"], {
  cwd: path.join(ROOT, "apps", "web"),
  env: { ...process.env, VITE_CONFIG_NATIVE_IGNORE_WARNING: "true" },
  stdio: "ignore",
});
const stop = () => vite.kill();
process.on("exit", stop);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("vite did not start");
}

const clubs = Array.from({ length: 24 }, (_, i) => {
  const n = i + 1;
  const independent = n % 5 === 3;
  return {
    id: `club-${n}`,
    name: n === 2 ? "Greater Manchester Sunday League Veterans Association FC" : `QA Club ${String(n).padStart(2, "0")} ${["Rovers FC", "United", "Town Youth", "Athletic"][i % 4]}`,
    league: independent ? null : ["Ogun State Amateur League", "Lagos Amateur Division", "Greater Manchester Sunday League"][i % 3],
    country: independent ? null : ["Nigeria", "Nigeria", "England"][i % 3],
    logoUrl: null,
    memberCount: [1284, 842, 1, 2106, 0][i % 5],
    joined: false,
  };
});

function cors(route, extra = {}) {
  const origin = route.request().headers()["origin"] ?? `http://localhost:${PORT}`;
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    ...extra,
  };
}
const json = (route, status, body) =>
  route.fulfill({ status, headers: cors(route, { "content-type": "application/json" }), body: JSON.stringify(body) });

async function installApi(page, state) {
  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors(route) });
    const url = new URL(req.url());
    const p = url.pathname;
    if (p === "/auth/refresh") return json(route, 200, { accessToken: TOKEN, accessTokenExpiresIn: 900 });
    if (p === "/notifications/unread-count") return json(route, 200, { unreadCount: 0 });
    if (/^\/users\/[^/]+$/.test(p)) {
      return json(route, 200, {
        id: "11111111-1111-4111-8111-111111111111",
        email: "tobi@example.com",
        displayName: "Tobi Adeyemi",
        verificationStatus: "unverified",
        isMinor: false,
        isTeamOrganiser: false,
        profileComplete: true,
        publicName: "tobi_a",
      });
    }
    if (p === "/auth/resend-verification-email") {
      if (state.rateLimited) return json(route, 429, { message: "Too Many Requests" });
      return json(route, 200, { message: "ok" });
    }
    if (p === "/clubs" && req.method() === "GET") {
      const cursor = url.searchParams.get("cursor");
      if (cursor && state.gateMore) await state.gateMore;
      return json(route, 200, cursor ? { items: clubs.slice(12), nextCursor: null } : { items: clubs.slice(0, 12), nextCursor: "c2" });
    }
    const join = /^\/clubs\/([^/]+)\/join$/.exec(p);
    if (join) {
      if (state.joinFails) return json(route, 500, { message: "boom" });
      const c = clubs.find((x) => x.id === join[1]);
      return json(route, 200, { joined: true, memberCount: (c?.memberCount ?? 0) + 1 });
    }
    return json(route, 404, { message: "not mocked" });
  });
}

const measure = {};
async function box(page, bucket, key, selector) {
  const el = page.locator(selector).first();
  if ((await el.count()) === 0) return;
  (measure[bucket] ??= {})[key] = await el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    const s = getComputedStyle(node);
    const f = (n) => Math.round(n * 10) / 10;
    return { x: f(r.x), y: f(r.y + scrollY), w: f(r.width), h: f(r.height), fontSize: s.fontSize, fontWeight: s.fontWeight, lineHeight: s.lineHeight, gap: s.rowGap, bg: s.backgroundColor };
  });
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });

await waitForServer();
const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());

// ---- verify email prompt, 390px
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const state = {};
  await installApi(page, state);
  await page.goto(`http://localhost:${PORT}/verify-email/prompt`);
  await page.getByRole("button", { name: /Resend verification email/ }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await shot(page, "verify-mobile-1-default");
  for (const [k, s] of Object.entries({
    page: ".verify-page", column: ".verify-page__column", icon: ".verify-page__column > :first-child", heading: ".verify-heading",
    subheading: ".verify-subheading", card: ".verify-card", stepNumber: ".verify-row__icon", stepTitle: ".verify-row__title",
    stepBody: ".verify-row__body", actions: ".verify-actions", primaryButton: ".verify-button--primary", secondaryButton: ".verify-button--secondary",
    resendRow: ".verify-resend", resendLink: ".verify-link-button",
  })) await box(page, "verify", k, s);
  await page.getByRole("button", { name: /Resend verification email/ }).click();
  await page.getByRole("status").waitFor();
  await shot(page, "verify-mobile-2-resent");
  await box(page, "verify", "resendStatus", ".verify-resend__message");
  state.rateLimited = true;
  await page.getByRole("button", { name: /Resend verification email/ }).click();
  await page.getByRole("alert").waitFor();
  await shot(page, "verify-mobile-3-rate-limited");
  await ctx.close();
}

// ---- club picker
for (const vp of [{ name: "desktop", width: 1440, height: 1070 }, { name: "mobile", width: 390, height: 844 }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  const state = {};
  await installApi(page, state);
  await page.goto(`http://localhost:${PORT}/signup/clubs`);
  await page.getByRole("heading", { name: "Join a club" }).waitFor();
  await page.locator(".club-picker__item").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await shot(page, `club-${vp.name}-1-loaded`);
  for (const [k, s] of Object.entries({
    page: ".club-picker-page", column: ".club-picker-page__column", heading: ".club-picker__heading", subheading: ".club-picker__subheading",
    searchBar: ".club-picker__search-bar", searchInput: ".club-picker__search", list: ".club-picker__list", card: ".club-picker__item",
    logo: ".club-picker__logo", name: ".club-picker__name", secondary: ".club-picker__secondary", members: ".club-picker__members",
    joinButton: ".club-picker__join-button", loadMore: ".club-picker__load-more", continue: ".club-picker__continue",
  })) await box(page, `club-${vp.name}`, k, s);

  await page.locator(".club-picker__join-button").first().click();
  await page.getByRole("button", { name: "Joined" }).first().waitFor();
  await shot(page, `club-${vp.name}-2-joined`);
  await box(page, `club-${vp.name}`, "joinedButton", ".club-picker__join-button--joined");

  state.joinFails = true;
  await page.locator(".club-picker__join-button:not(:disabled)").first().click();
  await page.locator(".club-picker__item-error").first().waitFor();
  await shot(page, `club-${vp.name}-3-join-failed`);
  await box(page, `club-${vp.name}`, "joinError", ".club-picker__item-error");
  state.joinFails = false;

  let release;
  state.gateMore = new Promise((r) => (release = r));
  await page.locator(".club-picker__load-more").click();
  await page.getByRole("button", { name: /^Loading/ }).waitFor();
  await shot(page, `club-${vp.name}-5-load-more-loading`);
  release();
  state.gateMore = null;

  await page.getByLabel("Filter clubs by name").fill("zzzz no such club");
  await page.getByText("No clubs match that filter.").waitFor();
  await shot(page, `club-${vp.name}-4-filter-empty`);
  await box(page, `club-${vp.name}`, "statusCard", ".club-picker__status");
  await ctx.close();
}

fs.writeFileSync(path.join(OUT, "measure.json"), JSON.stringify(measure, null, 2));
await browser.close();
stop();
console.log("done", phase);
