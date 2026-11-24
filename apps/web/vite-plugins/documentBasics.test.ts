import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { documentBasicsTags, resolveDocumentBasics, robotsTxt } from "./documentBasics";

describe("document basics", () => {
  it("is not indexable by default", () => {
    const b = resolveDocumentBasics({}, true);
    expect(b).toEqual({ indexable: false, canonicalUrl: null });
    expect(robotsTxt(b)).toBe("User-agent: *\nDisallow: /\n");
    expect(documentBasicsTags(b)).toEqual([
      { tag: "meta", attrs: { name: "robots", content: "noindex, nofollow" }, injectTo: "head" },
      { tag: "meta", attrs: { name: "twitter:card", content: "summary" }, injectTo: "head" },
    ]);
    expect(JSON.stringify(documentBasicsTags(b))).not.toContain("og:image");
  });

  it("only the exact string true turns indexing on", () => {
    for (const v of ["TRUE", "1", "yes", "false", ""]) {
      expect(resolveDocumentBasics({ VITE_SITE_INDEXABLE: v, VITE_SITE_URL: "https://x.com" }, true).indexable).toBe(false);
    }
  });

  it("is never indexable in dev", () => {
    expect(resolveDocumentBasics({ VITE_SITE_INDEXABLE: "true", VITE_SITE_URL: "https://x.com" }, false).indexable).toBe(false);
  });

  it("is indexable with a valid https origin", () => {
    for (const url of ["https://soccernity.com", "https://soccernity.com/"]) {
      const b = resolveDocumentBasics({ VITE_SITE_INDEXABLE: "true", VITE_SITE_URL: url }, true);
      expect(b).toEqual({ indexable: true, canonicalUrl: "https://soccernity.com/" });
      expect(robotsTxt(b)).toBe("User-agent: *\nAllow: /\n");
      const m = (attrs: Record<string, string>) => ({ tag: "meta", attrs, injectTo: "head" });
      const img = "https://soccernity.com/share-image.png";
      const alt = "Soccernity. Where the whole game lives.";
      expect(documentBasicsTags(b)).toEqual([
        { tag: "link", attrs: { rel: "canonical", href: "https://soccernity.com/" }, injectTo: "head" },
        m({ property: "og:url", content: "https://soccernity.com/" }),
        m({ property: "og:image", content: img }),
        m({ property: "og:image:type", content: "image/png" }),
        m({ property: "og:image:width", content: "1200" }),
        m({ property: "og:image:height", content: "630" }),
        m({ property: "og:image:alt", content: alt }),
        m({ name: "twitter:card", content: "summary_large_image" }),
        m({ name: "twitter:image", content: img }),
        m({ name: "twitter:image:alt", content: alt }),
      ]);
    }
  });

  it("fails when indexable and the origin is missing", () => {
    expect(() => resolveDocumentBasics({ VITE_SITE_INDEXABLE: "true" }, true)).toThrow(/VITE_SITE_URL/);
    expect(() => resolveDocumentBasics({ VITE_SITE_INDEXABLE: "true", VITE_SITE_URL: "" }, true)).toThrow(/VITE_SITE_URL/);
  });

  it("fails when indexable and the origin is http, has a path, query or is not a URL", () => {
    for (const url of ["http://soccernity.com", "https://soccernity.com/blog", "https://soccernity.com?x=1", "soccernity.com", "https://user@soccernity.com"]) {
      expect(() => resolveDocumentBasics({ VITE_SITE_INDEXABLE: "true", VITE_SITE_URL: url }, true)).toThrow(/VITE_SITE_URL/);
    }
  });

  it("the share image is a 1200 x 630 PNG under 300 KB", () => {
    const file = "public/share-image.png" // vitest runs from apps/web;
    const buf = readFileSync(file);
    expect([...buf.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(buf.readUInt32BE(16)).toBe(1200);
    expect(buf.readUInt32BE(20)).toBe(630);
    expect(statSync(file).size).toBeLessThan(300 * 1024);
  });
});
