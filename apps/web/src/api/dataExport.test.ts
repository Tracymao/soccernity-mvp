// api/dataExport.ts: request shapes, body codes, and the blob save.
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  DATA_EXPORT_FILE_NAME,
  DataExportApiError,
  downloadDataExport,
  getLatestDataExport,
  requestDataExport,
  saveBlobAsFile,
} from "./dataExport";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(response: Record<string, unknown>) {
  const fn = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}), ...response });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("requestDataExport", () => {
  it("POSTs the password with the bearer token and returns the id and status", async () => {
    const fn = stubFetch({ ok: true, status: 202, json: async () => ({ id: "e1", status: "preparing" }) });
    const result = await requestDataExport("tok", "pw");
    const [url, init] = fn.mock.calls[0];
    expect(String(url)).toMatch(/\/users\/me\/data-export$/);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual({ password: "pw" });
    expect(result).toEqual({ id: "e1", status: "preparing" });
  });

  it("carries the status and the body code of a refusal", async () => {
    stubFetch({ status: 403, json: async () => ({ code: "wrong_password", message: "anything" }) });
    await expect(requestDataExport("tok", "pw")).rejects.toMatchObject({ status: 403, code: "wrong_password" });
  });

  it("tolerates a refusal body that is not JSON", async () => {
    stubFetch({
      status: 429,
      json: async () => {
        throw new Error("no json");
      },
    });
    await expect(requestDataExport("tok", "pw")).rejects.toMatchObject({ status: 429, code: undefined });
  });

  it("turns a network failure into an error with no status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const error = await requestDataExport("tok", "pw").catch((e) => e);
    expect(error).toBeInstanceOf(DataExportApiError);
    expect(error.status).toBeUndefined();
  });
});

describe("getLatestDataExport", () => {
  it("GETs latest with the bearer token", async () => {
    const fn = stubFetch({ ok: true, status: 200, json: async () => ({ status: "none" }) });
    expect(await getLatestDataExport("tok")).toEqual({ status: "none" });
    const [url, init] = fn.mock.calls[0];
    expect(String(url)).toMatch(/\/users\/me\/data-export\/latest$/);
    expect(init.headers.Authorization).toBe("Bearer tok");
  });
});

describe("downloadDataExport", () => {
  it("fetches the file with the bearer token (not a plain link) and returns the blob", async () => {
    const blob = new Blob(["{}"], { type: "application/json" });
    const fn = stubFetch({ ok: true, status: 200, blob: async () => blob });
    expect(await downloadDataExport("tok", "e 1")).toBe(blob);
    const [url, init] = fn.mock.calls[0];
    expect(String(url)).toMatch(/\/users\/me\/data-export\/e%201\/download$/);
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it.each([
    [404, "data_export_not_found"],
    [409, "data_export_not_ready"],
    [410, "data_export_expired"],
  ])("carries %i with its code", async (status, code) => {
    stubFetch({ status, json: async () => ({ code }) });
    await expect(downloadDataExport("tok", "e1")).rejects.toMatchObject({ status, code });
  });
});

describe("saveBlobAsFile", () => {
  it("clicks a temporary link named soccernity-data-export.json", () => {
    const create = vi.fn(() => "blob:x");
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    const clicked: Array<{ download: string; href: string }> = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ download: this.download, href: this.getAttribute("href") ?? "" });
    });
    saveBlobAsFile(new Blob(["{}"]), DATA_EXPORT_FILE_NAME);
    expect(clicked).toEqual([{ download: "soccernity-data-export.json", href: "blob:x" }]);
    expect(document.querySelector("a[download]")).toBeNull();
    click.mockRestore();
  });
});
