import { describe, it, expect, vi, afterEach } from "vitest";
import { AuthApiError, login } from "./auth";

// login()'s deactivated-account detection previously regex-matched the
// backend's `message` string (/deactivat/i) -- fragile against any future
// copy change on the backend side (Decision Log #225). It now checks the
// structured `code: "account_deactivated"` field
// (services/api/src/modules/auth/auth.service.ts's ACCOUNT_DEACTIVATED_CODE)
// instead. These tests prove the new field-based detection works, and that
// message text alone -- without the field -- is deliberately NOT enough,
// so a future regression back to string-matching would be caught here.
function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("login()", () => {
  it("resolves with the login response on a 200", async () => {
    const responseBody = { accessToken: "a", accessTokenExpiresIn: 900, refreshToken: "r", refreshTokenExpiresAt: "x", user: {} };
    mockFetch(200, responseBody);

    await expect(login({ email: "a@example.com", password: "hunter2" })).resolves.toEqual(responseBody);
  });

  it("surfaces a deactivated account's structured code as AuthApiError.code === \"account_deactivated\"", async () => {
    mockFetch(401, {
      statusCode: 401,
      error: "Unauthorized",
      code: "account_deactivated",
      message: "This account has been deactivated. Use POST /auth/reactivate-account to restore it.",
    });

    let caught: AuthApiError | undefined;
    try {
      await login({ email: "a@example.com", password: "hunter2" });
    } catch (error) {
      caught = error as AuthApiError;
    }

    expect(caught).toBeInstanceOf(AuthApiError);
    expect(caught!.code).toBe("account_deactivated");
    expect(caught!.status).toBe(401);
  });

  it("does NOT set the account_deactivated code from message text alone -- the field must be present", async () => {
    // Same message a deactivated 401 would carry, but with no `code`
    // field on the body -- proves detection is keyed off the field, not
    // a substring match against `message`.
    mockFetch(401, {
      statusCode: 401,
      error: "Unauthorized",
      message: "This account has been deactivated. Use POST /auth/reactivate-account to restore it.",
    });

    let caught: AuthApiError | undefined;
    try {
      await login({ email: "a@example.com", password: "hunter2" });
    } catch (error) {
      caught = error as AuthApiError;
    }

    expect(caught).toBeInstanceOf(AuthApiError);
    expect(caught!.code).toBeUndefined();
    expect(caught!.message).toBe("That email and password don't match.");
  });

  it("maps an ordinary wrong-password 401 (no code) to the generic message", async () => {
    mockFetch(401, { statusCode: 401, error: "Unauthorized", message: "Invalid credentials" });

    await expect(login({ email: "a@example.com", password: "wrong" })).rejects.toThrow(
      "That email and password don't match.",
    );
  });

  it("maps a non-401 failure to the generic sign-in error", async () => {
    mockFetch(500, { message: "boom" });

    await expect(login({ email: "a@example.com", password: "hunter2" })).rejects.toThrow(
      "Something went wrong signing you in.",
    );
  });

  it("surfaces a network failure as AuthApiError with a cause", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );

    let caught: AuthApiError | undefined;
    try {
      await login({ email: "a@example.com", password: "hunter2" });
    } catch (error) {
      caught = error as AuthApiError;
    }

    expect(caught).toBeInstanceOf(AuthApiError);
    expect(caught!.cause).toBeInstanceOf(Error);
  });
});
