import { describe, it, expect } from "vitest";
import { COVER_ASPECT_RATIO, centreCropRect, cropToAspectRatio } from "./imageCrop";

describe("imageCrop", () => {
  it("cover ratio is the profile cover slot (796 x 192)", () => {
    expect(COVER_ASPECT_RATIO).toBeCloseTo(796 / 192, 5);
  });

  it("a too-wide image is cropped left and right, centred", () => {
    const r = centreCropRect(2000, 192, 796 / 192);
    expect(r.sy).toBe(0);
    expect(r.sh).toBe(192);
    expect(r.sw).toBe(796);
    expect(r.sx).toBe(Math.round((2000 - 796) / 2));
  });

  it("a too-tall image is cropped top and bottom, centred", () => {
    const r = centreCropRect(796, 800, 796 / 192);
    expect(r.sx).toBe(0);
    expect(r.sw).toBe(796);
    expect(r.sh).toBe(192);
    expect(r.sy).toBe(Math.round((800 - 192) / 2));
  });

  it("an image already at the ratio is not cropped", () => {
    expect(centreCropRect(796, 192, 796 / 192)).toEqual({ sx: 0, sy: 0, sw: 796, sh: 192 });
  });

  it("returns the original file when the browser cannot decode it (jsdom has no createImageBitmap)", async () => {
    const f = new File(["x"], "c.png", { type: "image/png" });
    expect(await cropToAspectRatio(f, COVER_ASPECT_RATIO)).toBe(f);
  });
});
