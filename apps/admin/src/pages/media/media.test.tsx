import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AdminApiError } from "../../api/adminClient";

vi.mock("../../api/adminMedia", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/adminMedia")>();
  return {
    ...actual,
    listMedia: vi.fn(),
    uploadMedia: vi.fn(),
    findMediaById: vi.fn(),
  };
});

import { listMedia, uploadMedia, findMediaById, type MediaAsset } from "../../api/adminMedia";
import MediaLibraryPage from "./MediaLibraryPage";
import MediaPreviewPage from "./MediaPreviewPage";
import MediaUploadPage from "./MediaUploadPage";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(listMedia).mockReset();
  vi.mocked(uploadMedia).mockReset();
  vi.mocked(findMediaById).mockReset();
});

function media(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: "media-1",
    uploaderId: "admin-1",
    url: "https://cdn.example.com/media/admin-1/abc123-photo.jpg",
    type: "image",
    size: 4_300_000,
    createdAt: "2026-09-15T10:00:00.000Z",
    ...overrides,
  };
}

function file(name: string, size: number, type: string): File {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

describe("MediaLibraryPage", () => {
  it("loads real media and renders name/date/size/type", async () => {
    vi.mocked(listMedia).mockResolvedValue({ items: [media()], nextCursor: null });

    render(
      <MemoryRouter>
        <MediaLibraryPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(listMedia).toHaveBeenCalledWith({ type: undefined, limit: 50 }));
    expect(await screen.findByText("abc123-photo.jpg")).not.toBeNull();
    expect(screen.getByText("4.1 MB")).not.toBeNull();
    expect(screen.getByText("image")).not.toBeNull();

    const link = screen.getByRole("link", { name: "Add Media" });
    expect(link.getAttribute("href")).toBe("/media/upload");
  });

  it("filters by type when a tab is clicked", async () => {
    vi.mocked(listMedia).mockResolvedValue({ items: [], nextCursor: null });

    render(
      <MemoryRouter>
        <MediaLibraryPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(listMedia).toHaveBeenCalledWith({ type: undefined, limit: 50 }));
    fireEvent.click(screen.getByRole("button", { name: "Videos" }));

    await waitFor(() => expect(listMedia).toHaveBeenLastCalledWith({ type: "video", limit: 50 }));
  });

  it("shows an empty state with no media", async () => {
    vi.mocked(listMedia).mockResolvedValue({ items: [], nextCursor: null });

    render(
      <MemoryRouter>
        <MediaLibraryPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("No media yet")).not.toBeNull();
  });

  it("surfaces a real backend error with a retry", async () => {
    vi.mocked(listMedia).mockRejectedValueOnce(new AdminApiError(500, "Server error"));
    vi.mocked(listMedia).mockResolvedValueOnce({ items: [media()], nextCursor: null });

    render(
      <MemoryRouter>
        <MediaLibraryPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("abc123-photo.jpg")).not.toBeNull();
  });

  it("each row links to its own preview page with the row's data in router state", async () => {
    vi.mocked(listMedia).mockResolvedValue({ items: [media()], nextCursor: null });

    render(
      <MemoryRouter>
        <MediaLibraryPage />
      </MemoryRouter>,
    );

    const link = await screen.findByRole("link", { name: "abc123-photo.jpg" });
    expect(link.getAttribute("href")).toBe("/media/preview/media-1");
  });
});

describe("MediaUploadPage", () => {
  it("uploads up to 5 selected files sequentially and shows Done", async () => {
    vi.mocked(uploadMedia).mockResolvedValue(media());

    render(
      <MemoryRouter>
        <MediaUploadPage />
      </MemoryRouter>,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const files = [file("a.jpg", 1000, "image/jpeg"), file("b.mp4", 2000, "video/mp4")];
    fireEvent.change(input, { target: { files } });

    expect(screen.getByText("a.jpg", { exact: false })).not.toBeNull();
    expect(screen.getByText("b.mp4", { exact: false })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(uploadMedia).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getAllByText("Done")).toHaveLength(2));
  });

  it("rejects a file over the 50MB limit before ever calling the API", async () => {
    render(
      <MemoryRouter>
        <MediaUploadPage />
      </MemoryRouter>,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file("huge.mp4", 51 * 1024 * 1024, "video/mp4")] } });

    expect(screen.getByText(/Exceeds the 50 MB limit/i)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(uploadMedia).not.toHaveBeenCalled();
  });

  it("keeps only the first 5 files when more are selected, with a note", async () => {
    render(
      <MemoryRouter>
        <MediaUploadPage />
      </MemoryRouter>,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const sixFiles = Array.from({ length: 6 }, (_, i) => file(`f${i}.jpg`, 100, "image/jpeg"));
    fireEvent.change(input, { target: { files: sixFiles } });

    expect(screen.getByText(/You can select up to 5 files/i)).not.toBeNull();
    expect(screen.getAllByText(/f\d\.jpg/)).toHaveLength(5);
  });

  it("surfaces a per-file failure without blocking the rest", async () => {
    vi.mocked(uploadMedia).mockRejectedValueOnce(new AdminApiError(413, "File too large"));
    vi.mocked(uploadMedia).mockResolvedValueOnce(media());

    render(
      <MemoryRouter>
        <MediaUploadPage />
      </MemoryRouter>,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [file("a.jpg", 1000, "image/jpeg"), file("b.jpg", 1000, "image/jpeg")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(uploadMedia).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("File too large")).not.toBeNull();
    expect(screen.getByText("Done")).not.toBeNull();
  });
});

describe("MediaPreviewPage", () => {
  it("renders an image preview from router state with no API call", async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: "/media/preview/media-1", state: { media: media() } }]}>
        <Routes>
          <Route path="/media/preview/:id" element={<MediaPreviewPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("abc123-photo.jpg")).not.toBeNull();
    expect(screen.getByRole("img")).not.toBeNull();
    expect(findMediaById).not.toHaveBeenCalled();
  });

  it("renders a video preview for a video asset", async () => {
    render(
      <MemoryRouter
        initialEntries={[{ pathname: "/media/preview/media-2", state: { media: media({ id: "media-2", type: "video" }) } }]}
      >
        <Routes>
          <Route path="/media/preview/:id" element={<MediaPreviewPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(document.querySelector("video")).not.toBeNull();
  });

  it("falls back to findMediaById on a direct visit with no router state", async () => {
    vi.mocked(findMediaById).mockResolvedValue(media());

    render(
      <MemoryRouter initialEntries={["/media/preview/media-1"]}>
        <Routes>
          <Route path="/media/preview/:id" element={<MediaPreviewPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(findMediaById).toHaveBeenCalledWith("media-1"));
    expect(await screen.findByText("abc123-photo.jpg")).not.toBeNull();
  });

  it("shows an honest not-found state when the id can't be resolved", async () => {
    vi.mocked(findMediaById).mockResolvedValue(null);

    render(
      <MemoryRouter initialEntries={["/media/preview/does-not-exist"]}>
        <Routes>
          <Route path="/media/preview/:id" element={<MediaPreviewPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("File not found")).not.toBeNull();
  });
});
