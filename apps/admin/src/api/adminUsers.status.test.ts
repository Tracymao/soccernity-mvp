// B-295 (Decision Log #485): PATCH /admin/users/:id carries a reasonCategory for a suspension and for nothing else.
// The API answers 400 suspension_reason_category_required without it and 400 suspension_reason_category_not_applicable
// with it on any other status, so the client must never send it on the other statuses.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./adminClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./adminClient")>();
  return { ...actual, adminFetch: vi.fn() };
});

import { adminFetch } from "./adminClient";
import { updateUserStatus } from "./adminUsers";

beforeEach(() => {
  vi.mocked(adminFetch).mockReset();
  vi.mocked(adminFetch).mockResolvedValue({ deleted: false });
});

function sentBody(): unknown {
  const call = vi.mocked(adminFetch).mock.calls[0];
  expect(call[0]).toBe("/admin/users/u1");
  expect(call[1]?.method).toBe("PATCH");
  return call[1]?.body;
}

describe("updateUserStatus", () => {
  it("sends the category when suspending", async () => {
    await updateUserStatus("u1", "suspended", "threats_or_violence");
    expect(sentBody()).toEqual({ status: "suspended", reasonCategory: "threats_or_violence" });
  });

  it.each(["active", "deleted"] as const)("never sends a category for %s, even if one is passed", async (status) => {
    await updateUserStatus("u1", status, "spam_or_scam");
    expect(sentBody()).toEqual({ status });
  });

  it("sends no category key at all for Unblock", async () => {
    await updateUserStatus("u1", "active");
    expect(Object.keys(sentBody() as object)).toEqual(["status"]);
  });
});
