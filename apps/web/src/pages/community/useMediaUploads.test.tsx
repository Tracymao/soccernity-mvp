// useMediaUploads: how the hook reacts when the server says uploads are off (B-042; B-306, Decision Log #501).
// The switch answers 403 `media_uploads_disabled` on POST /media/uploads AND on its confirm step; the older "no
// object store" answer is 503 `uploads_unavailable`. All four combinations must reach the same state.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useMediaUploads } from "./useMediaUploads";

vi.mock("../../api/postMedia", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/postMedia")>();
  return { ...actual, createUpload: vi.fn(), putFile: vi.fn(), confirmUpload: vi.fn(), getUpload: vi.fn(), deleteUpload: vi.fn() };
});
import { PostMediaApiError, confirmUpload, createUpload, deleteUpload, putFile } from "../../api/postMedia";

beforeEach(() => {
  for (const fn of [createUpload, putFile, confirmUpload, deleteUpload]) vi.mocked(fn).mockReset();
  vi.mocked(createUpload).mockResolvedValue({
    id: "m1",
    uploadUrl: "https://storage.test/put",
    uploadMethod: "PUT",
    uploadHeaders: {},
    expiresAt: "2026-11-14T10:15:00.000Z",
    maxBytes: 1024,
  });
  vi.mocked(putFile).mockResolvedValue(undefined);
  vi.mocked(deleteUpload).mockResolvedValue(undefined);
});

const picture = () => new File(["12345"], "goal.png", { type: "image/png" });

describe.each([
  ["503", 503, "uploads_unavailable"],
  ["403", 403, "media_uploads_disabled"],
])("useMediaUploads with an upload route answering %s %s", (_status, status, code) => {
  const off = () => new PostMediaApiError("Uploads are not available right now.", { status, code });

  it("at the link request: uploadsUnavailable turns on, the item is dropped, nothing was issued so nothing is deleted", async () => {
    vi.mocked(createUpload).mockRejectedValueOnce(off());
    const { result } = renderHook(() => useMediaUploads({ accessToken: "tok" }));
    expect(result.current.uploadsUnavailable).toBe(false);

    act(() => result.current.addFiles([picture()]));

    await waitFor(() => expect(result.current.uploadsUnavailable).toBe(true));
    expect(result.current.items).toEqual([]);
    expect(result.current.canPublish).toBe(true); // a text post still works
    expect(result.current.mediaIds).toEqual([]);
    expect(putFile).not.toHaveBeenCalled();
    expect(deleteUpload).not.toHaveBeenCalled();
  });

  it("at the confirm step: the same state, and the link that was issued is cleaned up", async () => {
    vi.mocked(confirmUpload).mockRejectedValueOnce(off());
    const { result } = renderHook(() => useMediaUploads({ accessToken: "tok" }));

    act(() => result.current.addFiles([picture()]));

    await waitFor(() => expect(result.current.uploadsUnavailable).toBe(true));
    expect(result.current.items).toEqual([]);
    expect(result.current.canPublish).toBe(true);
    await waitFor(() => expect(deleteUpload).toHaveBeenCalledWith("tok", "m1"));
  });
});

describe("useMediaUploads with other failures", () => {
  it("a 403 with any other code is an ordinary upload error, not 'uploads are off'", async () => {
    vi.mocked(createUpload).mockRejectedValueOnce(
      new PostMediaApiError("Guardian consent is pending", { status: 403, code: "guardian_consent_pending" }),
    );
    const { result } = renderHook(() => useMediaUploads({ accessToken: "tok" }));

    act(() => result.current.addFiles([picture()]));

    await waitFor(() => expect(result.current.items[0]?.phase).toBe("error"));
    expect(result.current.uploadsUnavailable).toBe(false);
  });

  it("a network failure is an ordinary upload error with Try again", async () => {
    vi.mocked(createUpload).mockRejectedValueOnce(new PostMediaApiError("Couldn't reach the Soccernity server."));
    const { result } = renderHook(() => useMediaUploads({ accessToken: "tok" }));

    act(() => result.current.addFiles([picture()]));

    await waitFor(() => expect(result.current.items[0]?.phase).toBe("error"));
    expect(result.current.uploadsUnavailable).toBe(false);
    expect(result.current.canPublish).toBe(false); // an errored file must be removed or retried first
  });
});
