// Run with: node --test .github/scripts/audit-gate.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "./audit-gate.mjs";

const adv = (url, severity = "high", name = "picomatch") => ({
  source: 1, name, title: "ReDoS", url, severity, range: "<=4.0.7",
});
const audit = {
  vulnerabilities: {
    picomatch: { via: [adv("https://github.com/advisories/GHSA-fc5q-39xc-vjpf")] },
    micromatch: { via: ["picomatch"] },
    "jest-util": { via: ["picomatch"] },
  },
};
const entry = (expires) => ({ id: "GHSA-fc5q-39xc-vjpf", expires });

test("an allow-listed advisory does not block, and its dependants add nothing", () => {
  const r = evaluate(audit, [entry("2026-12-17")], "2026-11-17");
  assert.equal(r.blocking.length, 0);
  assert.equal(r.allowed.length, 1);
});

test("an advisory that is not allow-listed blocks", () => {
  const r = evaluate(audit, [], "2026-11-17");
  assert.equal(r.blocking.length, 1);
  assert.equal(r.blocking[0].id, "ghsa-fc5q-39xc-vjpf");
});

test("an expired allow-list entry stops applying and the advisory blocks again", () => {
  const r = evaluate(audit, [entry("2026-12-17")], "2026-12-18");
  assert.equal(r.blocking.length, 1);
  assert.equal(r.expired.length, 1);
});

test("a different high advisory is never covered by the entry", () => {
  const other = {
    vulnerabilities: { x: { via: [adv("https://github.com/advisories/GHSA-aaaa-bbbb-cccc", "critical", "x")] } },
  };
  const r = evaluate(other, [entry("2026-12-17")], "2026-11-17");
  assert.equal(r.blocking.length, 1);
});

test("moderate and low advisories never block", () => {
  const low = {
    vulnerabilities: { y: { via: [adv("https://github.com/advisories/GHSA-dddd-eeee-ffff", "moderate", "y")] } },
  };
  assert.equal(evaluate(low, [], "2026-11-17").blocking.length, 0);
});
