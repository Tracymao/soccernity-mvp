import { StrictMode, type ComponentProps } from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CoverCropDialog from "./CoverCropDialog";

vi.mock("../../lib/imageCrop", async () => {
  const actual = await vi.importActual<typeof import("../../lib/imageCrop")>("../../lib/imageCrop");
  return { ...actual, cropImageToBlob: vi.fn() };
});
import { cropImageToBlob } from "../../lib/imageCrop";

const NOTICE = "Cover photos are checked automatically before they appear on your profile.";

beforeEach(() => {
  vi.mocked(cropImageToBlob).mockReset();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderDialog(overrides: Partial<ComponentProps<typeof CoverCropDialog>> = {}) {
  const props = {
    file: new File(["x"], "cover.png", { type: "image/png" }),
    notice: NOTICE,
    onSave: vi.fn(),
    onCancel: vi.fn(),
    onChooseAnother: vi.fn(),
    ...overrides,
  };
  render(<CoverCropDialog {...props} />);
  return props;
}

function loadImage(width: number, height: number) {
  const source = screen.getByTestId("cover-crop-source");
  Object.defineProperty(source, "naturalWidth", { value: width, configurable: true });
  Object.defineProperty(source, "naturalHeight", { value: height, configurable: true });
  fireEvent.load(source);
  return source;
}

describe("CoverCropDialog", () => {
  it("shows the crop step: title, window, zoom at 1.0x, preview, notice, Save and Cancel", () => {
    renderDialog();
    loadImage(1600, 1200);
    expect(screen.getByRole("dialog", { name: "Crop your cover photo" })).not.toBeNull();
    expect(screen.getByTestId("cover-crop-window")).not.toBeNull();
    expect(screen.getByText("Drag to move")).not.toBeNull();
    expect(screen.getByTestId("cover-crop-zoom-value").textContent).toBe("1.0x");
    expect(screen.getByTestId("cover-crop-preview")).not.toBeNull();
    expect(screen.getByText(NOTICE)).not.toBeNull();
    expect((screen.getByRole("button", { name: "Save cover photo" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("button", { name: "Cancel" })).not.toBeNull();
  });

  it("zoom runs 1x to 3x: the slider, the + and - buttons, and the value label", () => {
    renderDialog();
    loadImage(1600, 1200);
    const slider = screen.getByLabelText("Zoom") as HTMLInputElement;
    expect(slider.min).toBe("1");
    expect(slider.max).toBe("3");
    fireEvent.change(slider, { target: { value: "2" } });
    expect(screen.getByTestId("cover-crop-zoom-value").textContent).toBe("2.0x");
    fireEvent.change(slider, { target: { value: "3" } });
    expect(screen.getByTestId("cover-crop-zoom-value").textContent).toBe("3.0x");
    expect((screen.getByRole("button", { name: "Zoom in" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(screen.getByTestId("cover-crop-zoom-value").textContent).toBe("2.9x");
    fireEvent.change(slider, { target: { value: "1" } });
    expect((screen.getByRole("button", { name: "Zoom out" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("labels the ends of the zoom track 1x and 3x (K10)", () => {
    renderDialog();
    loadImage(1600, 1200);
    const ends = document.querySelector(".cover-crop__zoom-ends") as HTMLElement;
    expect(Array.from(ends.children).map((c) => c.textContent)).toEqual(["1x", "3x"]);
  });

  it("the too-small state: its own title, the width, and the alert accent bar", () => {
    renderDialog();
    loadImage(640, 400);
    expect(screen.getByRole("dialog", { name: "This image is too small" })).not.toBeNull();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(
      "A cover photo needs to be at least 796 pixels wide. This one is 640 pixels wide. Choose a larger image.",
    );
    expect(alert.className).toContain("cover-crop__alert");
    expect(screen.getByRole("button", { name: "Cancel" })).not.toBeNull();
  });

  describe("preview (K10)", () => {
    const original = window.innerWidth;
    afterEach(() => {
      Object.defineProperty(window, "innerWidth", { value: original, configurable: true, writable: true });
    });

    it("desktop: the 796:192 preview and the profile caption", () => {
      Object.defineProperty(window, "innerWidth", { value: 1280, configurable: true, writable: true });
      renderDialog();
      loadImage(1600, 1200);
      expect(screen.getByTestId("cover-crop-preview").getAttribute("data-fit")).toBe("crop");
      expect(screen.getByTestId("cover-crop-preview-caption").textContent).toBe(
        "This is how your cover will look on your profile.",
      );
    });

    it("phone: the cover-fit preview and the caption that says the sides are trimmed", () => {
      Object.defineProperty(window, "innerWidth", { value: 390, configurable: true, writable: true });
      renderDialog();
      loadImage(1600, 1200);
      const preview = screen.getByTestId("cover-crop-preview");
      expect(preview.getAttribute("data-fit")).toBe("cover-phone");
      expect(screen.getByTestId("cover-crop-preview-caption").textContent).toBe(
        "This is how your cover will look on a phone. The sides are trimmed to fit.",
      );
      // The picture sits in the crop-shaped layer, the same percentages as the crop window itself.
      const layer = preview.querySelector(".cover-crop__preview-crop") as HTMLElement;
      expect(layer.querySelector("img")).not.toBeNull();
    });
  });

  it("the arrow keys move the picture, and it never leaves the crop window", () => {
    renderDialog();
    loadImage(1600, 1600);
    fireEvent.change(screen.getByLabelText("Zoom"), { target: { value: "2" } });
    const cropWindow = screen.getByTestId("cover-crop-window");
    const picture = () => cropWindow.querySelector("img") as HTMLImageElement;
    const before = picture().style.left;
    fireEvent.keyDown(cropWindow, { key: "ArrowRight" });
    expect(picture().style.left).not.toBe(before);
    // Push far past the edge: the window clamps at the image edge.
    for (let i = 0; i < 100; i++) fireEvent.keyDown(cropWindow, { key: "ArrowRight" });
    const left = parseFloat(picture().style.left);
    const width = parseFloat(picture().style.width);
    expect(left).toBeLessThanOrEqual(0);
    expect(left + width).toBeGreaterThanOrEqual(100 - 1e-6);
  });

  it("an image under 796 px wide is refused, with Choose another image, and cannot be saved", () => {
    const props = renderDialog();
    loadImage(700, 900);
    expect(screen.getByRole("alert").textContent).toMatch(/at least 796 pixels wide/);
    expect(screen.getByRole("alert").textContent).toMatch(/700 pixels wide/);
    expect(screen.queryByRole("button", { name: "Save cover photo" })).toBeNull();
    expect(screen.queryByTestId("cover-crop-window")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Choose another image" }));
    expect(props.onChooseAnother).toHaveBeenCalledTimes(1);
  });

  it("an image exactly 796 px wide is accepted", () => {
    renderDialog();
    loadImage(796, 192);
    expect(screen.getByTestId("cover-crop-window")).not.toBeNull();
    expect(screen.queryByText("This image is too small")).toBeNull();
  });

  it("an image the browser cannot decode shows a message and Choose another image", () => {
    const props = renderDialog();
    fireEvent.error(screen.getByTestId("cover-crop-source"));
    expect(screen.getByRole("alert").textContent).toMatch(/JPEG, PNG or WebP/);
    fireEvent.click(screen.getByRole("button", { name: "Choose another image" }));
    expect(props.onChooseAnother).toHaveBeenCalled();
  });

  it("Save crops to the 796:192 region and hands over only the cropped blob", async () => {
    const cropped = new Blob(["cropped"], { type: "image/png" });
    vi.mocked(cropImageToBlob).mockResolvedValue(cropped);
    const props = renderDialog();
    const source = loadImage(1600, 1200);
    fireEvent.click(screen.getByRole("button", { name: "Save cover photo" }));
    await waitFor(() => expect(props.onSave).toHaveBeenCalledWith(cropped));
    const [image, rect, type] = vi.mocked(cropImageToBlob).mock.calls[0];
    expect(image).toBe(source);
    expect(type).toBe("image/png");
    expect(rect.sw / rect.sh).toBeCloseTo(796 / 192, 5);
    expect(rect.sw).toBeCloseTo(1600, 5); // 1x: the image just covers the window
  });

  it("Save at 2x crops a region half the size", async () => {
    vi.mocked(cropImageToBlob).mockResolvedValue(new Blob(["c"]));
    renderDialog();
    loadImage(1600, 1200);
    fireEvent.change(screen.getByLabelText("Zoom"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save cover photo" }));
    await waitFor(() => expect(cropImageToBlob).toHaveBeenCalled());
    expect(vi.mocked(cropImageToBlob).mock.calls[0][1].sw).toBeCloseTo(800, 5);
  });

  it("a crop failure shows a message and does not call onSave (the original is never offered)", async () => {
    vi.mocked(cropImageToBlob).mockRejectedValue(new Error("no canvas"));
    const props = renderDialog();
    loadImage(1600, 1200);
    fireEvent.click(screen.getByRole("button", { name: "Save cover photo" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn’t crop that image/);
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("Cancel and Escape close without saving", () => {
    const props = renderDialog();
    loadImage(1600, 1200);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onCancel).toHaveBeenCalledTimes(2);
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("under StrictMode the blob URL is not revoked before the image loads (regression: 'We couldn’t open that image')", () => {
    const revoke = vi.fn();
    let n = 0;
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => `blob:url-${(n += 1)}`), revokeObjectURL: revoke }));
    render(
      <StrictMode>
        <CoverCropDialog
          file={new File(["x"], "c.png", { type: "image/png" })}
          notice={NOTICE}
          onSave={vi.fn()}
          onCancel={vi.fn()}
          onChooseAnother={vi.fn()}
        />
      </StrictMode>,
    );
    const src = screen.getByTestId("cover-crop-source").getAttribute("src")!;
    // The URL the image is using is a LIVE one: every earlier URL was revoked, the current one was not.
    expect(revoke).not.toHaveBeenCalledWith(src);
    loadImage(1600, 1200);
    expect(screen.getByTestId("cover-crop-window")).not.toBeNull();
  });
});
