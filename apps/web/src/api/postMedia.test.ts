import { describe, it, expect, vi, afterEach } from "vitest";
import { PostMediaApiError, createUpload, putFile, reportMedia } from "./postMedia";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("post media API client", () => {
  it("returns the coded error the server sent, so a screen can branch on `code`", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(400, { statusCode: 400, code: "file_too_large", message: "That file is too large." })),
    );
    await expect(createUpload("tok", { contentType: "image/png", size: 99 })).rejects.toMatchObject({
      name: "PostMediaApiError",
      status: 400,
      code: "file_too_large",
      message: "That file is too large.",
    });
  });

  it("sends the bearer token and posts the report with no body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { reported: true, alreadyReported: true }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await reportMedia("tok", "media-1");
    expect(result.alreadyReported).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/media\/media-1\/report$/);
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("sends the trimmed reason as JSON, and sends no body for a blank one", async () => {
    // A fresh Response per call: a body can be read only once.
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(200, { reported: true, alreadyReported: false }));
    vi.stubGlobal("fetch", fetchMock);
    await reportMedia("tok", "media-1", "  not football  ");
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ reason: "not football" }));
    expect(fetchMock.mock.calls[0][1].headers["Content-Type"]).toBe("application/json");
    await reportMedia("tok", "media-1", "   ");
    expect(fetchMock.mock.calls[1][1].body).toBeUndefined();
  });

  it("carries the daily-limit code through on a 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(429, { statusCode: 429, code: "media_report_daily_limit", message: "Please try again tomorrow." }),
      ),
    );
    await expect(reportMedia("tok", "m")).rejects.toMatchObject({ status: 429, code: "media_report_daily_limit" });
  });

  it("says it could not reach the server when the network is down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(reportMedia("tok", "m")).rejects.toBeInstanceOf(PostMediaApiError);
  });
});

class FakeXhr {
  static last: FakeXhr;
  upload: { onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void } = {};
  headers: Record<string, string> = {};
  status = 200;
  onload?: () => void;
  onerror?: () => void;
  onabort?: () => void;
  method = "";
  url = "";
  sent: unknown;
  aborted = false;
  constructor() {
    FakeXhr.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: unknown) {
    this.sent = body;
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
}

describe("putFile", () => {
  const link = {
    uploadUrl: "https://storage.test/put?sig=1",
    uploadMethod: "PUT" as const,
    uploadHeaders: { "Content-Type": "image/png", "Content-Length": "5" },
  };

  it("PUTs the file with exactly the issued headers (not Content-Length), reports progress and resolves", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const progress = vi.fn();
    const file = new Blob(["12345"]);
    const done = putFile(link, file, progress);
    FakeXhr.last.upload.onprogress?.({ lengthComputable: true, loaded: 2, total: 5 });
    FakeXhr.last.onload?.();
    await done;
    expect(FakeXhr.last.method).toBe("PUT");
    expect(FakeXhr.last.url).toBe(link.uploadUrl);
    expect(FakeXhr.last.headers).toEqual({ "Content-Type": "image/png" });
    expect(FakeXhr.last.sent).toBe(file);
    expect(progress).toHaveBeenNthCalledWith(1, 0.4);
    expect(progress).toHaveBeenLastCalledWith(1);
  });

  it("rejects when the storage answers with an error status", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const done = putFile(link, new Blob(["x"]), () => undefined);
    FakeXhr.last.status = 403;
    FakeXhr.last.onload?.();
    await expect(done).rejects.toMatchObject({ name: "PostMediaApiError", status: 403 });
  });

  it("aborts when the signal fires, rejecting with an AbortError", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const controller = new AbortController();
    const done = putFile(link, new Blob(["x"]), () => undefined, controller.signal);
    controller.abort();
    await expect(done).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeXhr.last.aborted).toBe(true);
  });
});
