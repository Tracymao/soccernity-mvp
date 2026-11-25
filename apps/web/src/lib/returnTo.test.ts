// Decision Log #571 (code-only): the login return-to allow-list.
import { describe, expect, it } from "vitest";
import { buildLoginLink, safeReturnTo } from "./returnTo";

describe("safeReturnTo -- accepted", () => {
  it.each([
    ["/search", "/search"],
    ["/search?q=salah", "/search?q=salah"],
    ["/search?q=man%20utd%20%26%20co", "/search?q=man%20utd%20%26%20co"],
    ["/search?q=a#frag", "/search?q=a"],
  ])("%s -> %s", (raw, expected) => {
    expect(safeReturnTo(raw)).toBe(expected);
  });
});

describe("safeReturnTo -- rejected", () => {
  const rejected: Array<[string, string | null | undefined]> = [
    ["empty string", ""],
    ["null", null],
    ["undefined", undefined],
    ["no leading slash", "search"],
    ["absolute https URL", "https://evil.example/search"],
    ["absolute http URL", "http://evil.example"],
    ["protocol-relative", "//evil.example/search"],
    ["slash then backslash", "/\\evil.example"],
    ["double backslash", "\\\\evil.example"],
    ["javascript: URL", "javascript:alert(1)"],
    ["dot-dot segment", "/search/../login"],
    ["longer path name", "/searchx"],
    ["trailing slash", "/search/"],
    ["wrong case", "/Search"],
    ["another page: /login", "/login"],
    ["another page: /community", "/community"],
    ["encoded dot-dot", "/%2e%2e/search"],
    ["trailing newline", "/search\n"],
    ["tab in the path", "/search\t?q=a"],
    ["raw space in the query", "/search?q=a b"],
    ["301 characters", "/search?q=" + "a".repeat(291)],
    ["encoded CRLF header injection", "/search%0d%0aSet-Cookie:x=1"],
    ["NUL character", "/search?q=a\u0000b"],
    ["backslash in the query", "/search?q=a\\b"],
  ];
  it.each(rejected)("%s", (_label, raw) => {
    expect(safeReturnTo(raw)).toBeNull();
  });

  it("exactly 300 characters is still accepted", () => {
    const raw = "/search?q=" + "a".repeat(290);
    expect(raw.length).toBe(300);
    expect(safeReturnTo(raw)).toBe(raw);
  });
});

describe("buildLoginLink", () => {
  it("carries a valid return-to, encoded", () => {
    expect(buildLoginLink("/search?q=salah")).toBe("/login?returnTo=" + encodeURIComponent("/search?q=salah"));
    expect(buildLoginLink("/search?q=salah")).toBe("/login?returnTo=%2Fsearch%3Fq%3Dsalah");
  });

  it("encodes an already-encoded query once more, so it survives the round trip", () => {
    const link = buildLoginLink("/search?q=man%20utd");
    expect(link).toBe("/login?returnTo=%2Fsearch%3Fq%3Dman%2520utd");
    const back = new URLSearchParams(link.split("?")[1]).get("returnTo");
    expect(safeReturnTo(back)).toBe("/search?q=man%20utd");
  });

  it("drops a hash", () => {
    expect(buildLoginLink("/search?q=a#frag")).toBe("/login?returnTo=%2Fsearch%3Fq%3Da");
  });

  it.each(["", "/community", "https://evil.example/search", "//evil.example", "/search/../login"])(
    "falls back to plain /login for %j",
    (raw) => {
      expect(buildLoginLink(raw)).toBe("/login");
    },
  );
});
