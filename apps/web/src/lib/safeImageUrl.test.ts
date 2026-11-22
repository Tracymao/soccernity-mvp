import { describe, it, expect, afterEach, vi } from "vitest";
import { safeImageUrl } from "./safeImageUrl";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("safeImageUrl", () => {
  it("refuses a provider host such as highlightly.net", () => {
    expect(safeImageUrl("https://highlightly.net/crests/chelsea.png")).toBeNull();
    expect(safeImageUrl("https://cdn.highlightly.net/x.png")).toBeNull();
  });

  it("allows the app's own origin, absolute and relative", () => {
    expect(safeImageUrl(`${window.location.origin}/a.png`)).toBe(`${window.location.origin}/a.png`);
    expect(safeImageUrl("/a.png")).toBe("/a.png");
  });

  it("allows the configured media host only", () => {
    vi.stubEnv("VITE_MEDIA_BASE_URL", "https://media.soccernity.com");
    expect(safeImageUrl("https://media.soccernity.com/profile-media/u/1.jpg")).toBe(
      "https://media.soccernity.com/profile-media/u/1.jpg",
    );
    expect(safeImageUrl("https://media.staging.soccernity.com/x.jpg")).toBeNull();
    expect(safeImageUrl("https://media.soccernity.com.evil.example/x.jpg")).toBeNull();
  });

  it("refuses the media host when none is configured", () => {
    vi.stubEnv("VITE_MEDIA_BASE_URL", "");
    expect(safeImageUrl("https://media.soccernity.com/x.jpg")).toBeNull();
  });

  it("refuses empty, malformed and protocol-relative values", () => {
    expect(safeImageUrl(null)).toBeNull();
    expect(safeImageUrl(undefined)).toBeNull();
    expect(safeImageUrl("")).toBeNull();
    expect(safeImageUrl("   ")).toBeNull();
    expect(safeImageUrl("//highlightly.net/x.png")).toBeNull();
    expect(safeImageUrl(String.raw`\highlightly.netx.png`)).toBeNull();
    expect(safeImageUrl("http://")).toBeNull();
    expect(safeImageUrl("javascript:alert(1)")).toBeNull();
    expect(safeImageUrl("ftp://media.soccernity.com/x.png")).toBeNull();
  });

  it("passes data:image and blob: URLs, which the CSP allows", () => {
    expect(safeImageUrl("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
    expect(safeImageUrl("blob:http://localhost/abc")).toBe("blob:http://localhost/abc");
    expect(safeImageUrl("data:text/html,<script>")).toBeNull();
  });
});
