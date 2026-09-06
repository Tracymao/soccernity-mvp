import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MediaLibraryPage from "./MediaLibraryPage";
import MediaPreviewPage from "./MediaPreviewPage";
import MediaUploadPage from "./MediaUploadPage";

afterEach(cleanup);

describe("Media stub screens", () => {
  it("Library: discloses no backend + no storage, links to upload", () => {
    render(<MemoryRouter><MediaLibraryPage /></MemoryRouter>);
    expect(screen.getByRole("note").textContent).toMatch(/no file storage is configured/i);
    expect(screen.getByRole("link", { name: "Add Media" }).getAttribute("href")).toBe("/media/upload");
  });

  it("Preview: shows the empty preview state", () => {
    render(<MemoryRouter><MediaPreviewPage /></MemoryRouter>);
    expect(screen.getByText("Preview — no media")).not.toBeNull();
  });

  it("Upload: the Upload button is disabled", () => {
    render(<MemoryRouter><MediaUploadPage /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Upload" }).hasAttribute("disabled")).toBe(true);
  });
});
