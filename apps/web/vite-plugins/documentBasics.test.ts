import { describe, expect, it } from "vitest";
import { documentBasicsTags, resolveDocumentBasics, robotsTxt } from "./documentBasics";

describe("document basics", () => {
  it("is not indexable by default", () => {
    const b = resolveDocumentBasics({}, true);
    expect(b).toEqual({ indexable: false, canonicalUrl: null });
    expect(robotsTxt(b)).toBe("User-agent: *\nDisallow: /\n");
    expect(documentBasicsTags(b)).toEqual([
      { tag: "meta", attrs: { name: "robots", content: "noindex, nofollow" }, injectTo: "head" },
    ]);
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
      expect(documentBasicsTags(b)).toEqual([
        { tag: "link", attrs: { rel: "canonical", href: "https://soccernity.com/" }, injectTo: "head" },
        { tag: "meta", attrs: { property: "og:url", content: "https://soccernity.com/" }, injectTo: "head" },
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
});
