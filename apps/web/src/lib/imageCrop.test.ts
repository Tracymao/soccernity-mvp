import { describe, it, expect, vi } from "vitest";
import {
  COVER_ASPECT_RATIO,
  COVER_MIN_WIDTH_PX,
  COVER_ZOOM_MAX,
  COVER_ZOOM_MIN,
  centreCropRect,
  clampCentre,
  clampZoom,
  cropImageToBlob,
  cropRectFor,
  cropRegionSize,
  isCoverWideEnough,
} from "./imageCrop";

describe("imageCrop constants (Decision Log #414 item 2)", () => {
  it("cover ratio is the profile cover slot (796 x 192)", () => {
    expect(COVER_ASPECT_RATIO).toBeCloseTo(796 / 192, 5);
  });

  it("zoom runs 1x to 3x and the minimum chosen width is 796 px", () => {
    expect(COVER_ZOOM_MIN).toBe(1);
    expect(COVER_ZOOM_MAX).toBe(3);
    expect(COVER_MIN_WIDTH_PX).toBe(796);
    expect(isCoverWideEnough(795)).toBe(false);
    expect(isCoverWideEnough(796)).toBe(true);
  });

  it("clampZoom keeps the value inside 1..3 and survives NaN", () => {
    expect(clampZoom(0.2)).toBe(1);
    expect(clampZoom(7)).toBe(3);
    expect(clampZoom(1.5)).toBe(1.5);
    expect(clampZoom(Number.NaN)).toBe(1);
  });
});

describe("centreCropRect", () => {
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
});

describe("cropRegionSize / cropRectFor", () => {
  it("at 1x a tall image's crop region is the full width (the image just covers the window)", () => {
    const { w, h } = cropRegionSize(1200, 1200, 1);
    expect(w).toBe(1200);
    expect(h).toBeCloseTo(1200 / COVER_ASPECT_RATIO, 5);
  });

  it("at 1x a wide image's crop region is the full height", () => {
    const { w, h } = cropRegionSize(4000, 400, 1);
    expect(h).toBe(400);
    expect(w).toBeCloseTo(400 * COVER_ASPECT_RATIO, 5);
  });

  it("zoom z shows a region 1/z as large, keeping the ratio", () => {
    const one = cropRegionSize(1200, 1200, 1);
    const three = cropRegionSize(1200, 1200, 3);
    expect(three.w).toBeCloseTo(one.w / 3, 5);
    expect(three.h).toBeCloseTo(one.h / 3, 5);
    expect(three.w / three.h).toBeCloseTo(COVER_ASPECT_RATIO, 5);
  });

  it("a centred window sits in the middle of the image", () => {
    const rect = cropRectFor(1200, 1200, 2, 0.5, 0.5);
    expect(rect.sx + rect.sw / 2).toBeCloseTo(600, 5);
    expect(rect.sy + rect.sh / 2).toBeCloseTo(600, 5);
  });

  it("a window pushed past an edge is clamped inside the image", () => {
    const left = cropRectFor(1200, 1200, 2, -5, -5);
    expect(left.sx).toBe(0);
    expect(left.sy).toBe(0);
    const right = cropRectFor(1200, 1200, 2, 9, 9);
    expect(right.sx + right.sw).toBeCloseTo(1200, 5);
    expect(right.sy + right.sh).toBeCloseTo(1200, 5);
  });

  it("at 1x an image exactly at the ratio has no room to move", () => {
    const rect = cropRectFor(796, 192, 1, 0.2, 0.9);
    expect(rect.sx).toBe(0);
    expect(rect.sy).toBe(0);
    expect(rect.sw).toBeCloseTo(796, 5);
    expect(rect.sh).toBeCloseTo(192, 5);
  });

  it("clampCentre keeps the centre where the window stays inside the image", () => {
    const { w, h } = cropRegionSize(1200, 1200, 2);
    const c = clampCentre(1200, 1200, 2, 0, 1);
    expect(c.cx).toBeCloseTo(w / 2 / 1200, 5);
    expect(c.cy).toBeCloseTo(1 - h / 2 / 1200, 5);
  });
});

describe("cropImageToBlob", () => {
  it("throws (rather than returning the original) when there is no canvas, so the original is never uploaded", async () => {
    // jsdom has no 2d canvas context.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    await expect(
      cropImageToBlob(document.createElement("canvas"), { sx: 0, sy: 0, sw: 796, sh: 192 }, "image/png"),
    ).rejects.toThrow();
  });
});
