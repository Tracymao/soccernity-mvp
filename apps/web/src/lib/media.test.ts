import { describe, it, expect } from "vitest";
import { firstVideoUrl, isVideoUrl } from "./media";

describe("isVideoUrl (v1 extension heuristic)", () => {
  it("recognises common video extensions, case-insensitively, ignoring query and fragment", () => {
    expect(isVideoUrl("https://cdn.example.com/a/clip.mp4")).toBe(true);
    expect(isVideoUrl("https://cdn.example.com/a/CLIP.WEBM")).toBe(true);
    expect(isVideoUrl("https://cdn.example.com/a/clip.mov?sig=abc#t=1")).toBe(true);
    expect(isVideoUrl("/relative/path/clip.m4v")).toBe(true);
  });

  it("rejects images, extensionless URLs and extensions that only appear in the query", () => {
    expect(isVideoUrl("https://cdn.example.com/photo.jpg")).toBe(false);
    expect(isVideoUrl("https://cdn.example.com/watch/123")).toBe(false);
    expect(isVideoUrl("https://cdn.example.com/photo.jpg?file=clip.mp4")).toBe(false);
  });

  it("firstVideoUrl returns the first video URL or null", () => {
    expect(firstVideoUrl(["https://x/a.jpg", "https://x/b.mp4", "https://x/c.webm"])).toBe("https://x/b.mp4");
    expect(firstVideoUrl(["https://x/a.jpg"])).toBeNull();
    expect(firstVideoUrl([])).toBeNull();
  });
});
