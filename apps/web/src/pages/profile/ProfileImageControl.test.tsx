import type { ComponentProps } from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ProfileImageControl from "./ProfileImageControl";
import { UsersApiError } from "../../api/users";

vi.mock("../../api/users", async () => {
  const actual = await vi.importActual<typeof import("../../api/users")>("../../api/users");
  return { ...actual, uploadProfileImage: vi.fn(), deleteProfileImage: vi.fn() };
});
import { uploadProfileImage, deleteProfileImage } from "../../api/users";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(uploadProfileImage).mockReset();
  vi.mocked(deleteProfileImage).mockReset();
});

function file(name = "me.png", type = "image/png", size = 1000): File {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

function renderControl(props: Partial<ComponentProps<typeof ProfileImageControl>> = {}) {
  return render(<ProfileImageControl kind="avatar" accessToken="t" userId="u1" image={null} {...props} />);
}

describe("ProfileImageControl", () => {
  it("none: offers a choose button and the 'checked automatically' note", () => {
    renderControl();
    expect(screen.getByRole("button", { name: "Choose a picture" })).not.toBeNull();
    expect(screen.getByText(/checked automatically/i)).not.toBeNull();
  });

  it("uploads a chosen file and shows 'Under review' (a new upload is pending)", async () => {
    const onChange = vi.fn();
    vi.mocked(uploadProfileImage).mockResolvedValue({ url: "https://img/x.png", status: "pending" });
    renderControl({ onChange });
    fireEvent.change(screen.getByTestId("profile-image-avatar-input"), { target: { files: [file()] } });
    await screen.findByText("Under review");
    expect(uploadProfileImage).toHaveBeenCalledWith(
      "t",
      "u1",
      "avatar",
      expect.anything(),
      "me.png",
      expect.any(AbortSignal),
    );
    expect(onChange).toHaveBeenCalledWith({ url: "https://img/x.png", status: "pending" });
    expect(screen.getByText(/only you can see this picture/i)).not.toBeNull();
  });

  it("rejects a wrong type locally and never calls the API", async () => {
    renderControl();
    fireEvent.change(screen.getByTestId("profile-image-avatar-input"), {
      target: { files: [file("a.gif", "image/gif")] },
    });
    expect((await screen.findByRole("alert")).textContent).toMatch(/JPEG, PNG or WebP/);
    expect(uploadProfileImage).not.toHaveBeenCalled();
  });

  it("rejects an oversize file locally and never calls the API", async () => {
    renderControl();
    fireEvent.change(screen.getByTestId("profile-image-avatar-input"), {
      target: { files: [file("big.png", "image/png", 6 * 1024 * 1024)] },
    });
    expect((await screen.findByRole("alert")).textContent).toMatch(/under 5 MB/);
    expect(uploadProfileImage).not.toHaveBeenCalled();
  });

  it("shows the server message when the upload fails", async () => {
    vi.mocked(uploadProfileImage).mockRejectedValue(new UsersApiError("Storage is not available.", { status: 503 }));
    renderControl();
    fireEvent.change(screen.getByTestId("profile-image-avatar-input"), { target: { files: [file()] } });
    expect((await screen.findByRole("alert")).textContent).toBe("Storage is not available.");
    expect(screen.getByRole("button", { name: "Try again" })).not.toBeNull();
  });

  it("Cancel aborts the in-flight upload and leaves nothing behind", async () => {
    let signal: AbortSignal | undefined;
    vi.mocked(uploadProfileImage).mockImplementation(
      (...args) =>
        new Promise((_resolve, reject) => {
          signal = args[5] as AbortSignal;
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const onChange = vi.fn();
    renderControl({ onChange });
    fireEvent.change(screen.getByTestId("profile-image-avatar-input"), { target: { files: [file()] } });
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await screen.findByRole("button", { name: "Choose a picture" });
    expect(signal?.aborted).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("rejected: shows the not-approved line, the reason only when the server sent one, and Choose another", () => {
    const { rerender } = renderControl({ image: { url: "u", status: "rejected" } });
    expect(screen.getByRole("alert").textContent).toMatch(/wasn’t approved/);
    expect(screen.queryByText(/Reason:/)).toBeNull();
    expect(screen.getByRole("button", { name: "Choose another picture" })).not.toBeNull();
    rerender(
      <ProfileImageControl
        kind="avatar"
        accessToken="t"
        userId="u1"
        image={{ url: "u", status: "rejected", rejectionReason: "Shows a face" }}
      />,
    );
    expect(screen.getByText(/Reason: Shows a face/)).not.toBeNull();
    // A null reason (a rejection with nothing recorded) shows no Reason line.
    rerender(
      <ProfileImageControl
        kind="avatar"
        accessToken="t"
        userId="u1"
        image={{ url: "u", status: "rejected", rejectionReason: null }}
      />,
    );
    expect(screen.queryByText(/Reason:/)).toBeNull();
  });

  it("cover rejected: shows the reason the server sent, and the rejected line names the cover photo", () => {
    renderControl({
      kind: "cover",
      image: { url: "u", status: "rejected", rejectionReason: "Not a football image" },
    });
    expect(screen.getByRole("alert").textContent).toMatch(/cover photo wasn’t approved/);
    expect(screen.getByTestId("profile-image-cover-reason").textContent).toBe("Reason: Not a football image");
    expect(screen.getByRole("button", { name: "Choose another cover photo" })).not.toBeNull();
  });

  it("the rejected and approved lines carry no pending-copy tag (Decision Log #412 item 5)", () => {
    const { container, rerender } = renderControl({ image: { url: "u", status: "rejected" } });
    expect(container.textContent).not.toMatch(/COPY PENDING/);
    rerender(
      <ProfileImageControl kind="avatar" accessToken="t" userId="u1" image={{ url: "u", status: "approved" }} />,
    );
    expect(container.textContent).not.toMatch(/COPY PENDING/);
  });

  it("approved: shows the Approved pill", () => {
    renderControl({ image: { url: "u", status: "approved" } });
    expect(screen.getByText("Approved")).not.toBeNull();
  });

  it("remove asks for confirmation; Keep leaves the picture, Remove deletes it", async () => {
    const onChange = vi.fn();
    vi.mocked(deleteProfileImage).mockResolvedValue(undefined);
    renderControl({ image: { url: "u", status: "pending" }, onChange });
    fireEvent.click(screen.getByRole("button", { name: "Remove picture" }));
    expect(screen.getByText("Remove this picture?")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Keep picture" }));
    expect(deleteProfileImage).not.toHaveBeenCalled();
    expect(screen.getByText("Under review")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Remove picture" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove picture" }));
    await waitFor(() => expect(deleteProfileImage).toHaveBeenCalledWith("t", "u1", "avatar"));
    await screen.findByRole("button", { name: "Choose a picture" });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("the cover uses its own wording", () => {
    render(<ProfileImageControl kind="cover" accessToken="t" userId="u1" image={null} />);
    expect(screen.getByRole("button", { name: "Choose a cover photo" })).not.toBeNull();
    expect(screen.getByText(/cover photos are checked automatically/i)).not.toBeNull();
  });
});

describe("ProfileImageControl: cover crop step (B-210 / B-227)", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function chooseCover() {
    const view = renderControl({ kind: "cover" });
    fireEvent.change(screen.getByTestId("profile-image-cover-input"), { target: { files: [file("c.png")] } });
    return view;
  }

  it("choosing a cover opens the crop step and uploads nothing yet", () => {
    chooseCover();
    expect(screen.getByRole("dialog", { name: "Crop your cover photo" })).not.toBeNull();
    expect(uploadProfileImage).not.toHaveBeenCalled();
  });

  it("Cancel in the crop step leaves nothing behind: no upload, back to Choose a cover photo", () => {
    chooseCover();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(uploadProfileImage).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Choose a cover photo" })).not.toBeNull();
  });

  it("an avatar is not cropped: it uploads straight away as chosen", async () => {
    vi.mocked(uploadProfileImage).mockResolvedValue({ url: "u", status: "pending" });
    renderControl();
    fireEvent.change(screen.getByTestId("profile-image-avatar-input"), { target: { files: [file()] } });
    await screen.findByText("Under review");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Choose another image in the crop step re-opens the file chooser and closes the dialog", () => {
    chooseCover();
    const source = screen.getByTestId("cover-crop-source");
    Object.defineProperty(source, "naturalWidth", { value: 400 });
    Object.defineProperty(source, "naturalHeight", { value: 300 });
    fireEvent.load(source);
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "Choose another image" }));
    expect(click).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    click.mockRestore();
  });

  it("a cover over 5 MB is allowed into the crop step (the limit applies to the cropped upload)", () => {
    renderControl({ kind: "cover" });
    fireEvent.change(screen.getByTestId("profile-image-cover-input"), {
      target: { files: [file("big.png", "image/png", 9 * 1024 * 1024)] },
    });
    expect(screen.getByRole("dialog")).not.toBeNull();
  });

  it("an unsupported type is refused before the crop step", () => {
    renderControl({ kind: "cover" });
    fireEvent.change(screen.getByTestId("profile-image-cover-input"), {
      target: { files: [file("x.gif", "image/gif")] },
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("alert")).not.toBeNull();
  });
});
