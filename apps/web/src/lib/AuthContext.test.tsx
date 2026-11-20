import { StrictMode } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, RESTORE_GATE_MAX_MS, useAuth } from "./AuthContext";
import { installSilentRefresh } from "./silentRefresh";
import { getStoredAccessToken, storeSession } from "./session";
import { clearSession, seedSession } from "../test/session";

const API = "http://localhost:3000";
const realFetch = window.fetch;
let backend: ReturnType<typeof vi.fn>;

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function refreshCalls() {
  return backend.mock.calls.filter(([u]) => u === `${API}/auth/refresh`);
}

// What a protected page effectively renders: a signed-in marker or the log-in prompt.
function Probe() {
  const { accessToken, status } = useAuth();
  return <p>{accessToken ? `signed in:${accessToken}` : `signed out (${status})`}</p>;
}

beforeEach(() => {
  clearSession();
  backend = vi.fn();
  window.fetch = backend as unknown as typeof fetch;
  installSilentRefresh();
});

afterEach(() => {
  cleanup();
  window.fetch = realFetch;
});

describe("AuthProvider start-up restore (B-246)", () => {
  it("shows a loading line, renders NOTHING else until the refresh settles, then the signed-in page (no login flash)", async () => {
    let resolve!: (r: Response) => void;
    backend.mockImplementation(() => new Promise<Response>((r) => (resolve = r)));
    const pageRendered = vi.fn();
    function Page() {
      pageRendered();
      return <Probe />;
    }

    render(
      <AuthProvider>
        <Page />
      </AuthProvider>,
    );

    expect(screen.getByRole("status").textContent).toBe("Loading…");
    await waitFor(() => expect(refreshCalls()).toHaveLength(1));
    // The page has not rendered yet, so it cannot have shown a signed-out prompt.
    expect(pageRendered).not.toHaveBeenCalled();

    await act(async () => {
      resolve(json(200, { accessToken: "restored" }));
    });

    await screen.findByText("signed in:restored");
    expect(pageRendered).toHaveBeenCalled();
    expect(screen.queryByText("Loading…")).toBeNull();
    // The very first render of the page already had the session.
    expect(screen.queryByText(/signed out/)).toBeNull();
  });

  it("a refresh that never answers does not hold the app hostage: after the bound it renders signed out, and a late success signs in", async () => {
    vi.useFakeTimers();
    try {
      let resolve!: (r: Response) => void;
      backend.mockImplementation(() => new Promise<Response>((r) => (resolve = r)));

      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      );
      // (the no-Web-Locks lease fallback polls briefly before it sends the request)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(RESTORE_GATE_MAX_MS - 100);
      });
      expect(screen.getByRole("status").textContent).toBe("Loading…");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      expect(screen.queryByText("Loading…")).toBeNull();
      expect(screen.getByText("signed out (ready)")).toBeTruthy();

      await act(async () => {
        resolve(json(200, { accessToken: "late" }));
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByText("signed in:late")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("with no cookie (401) it renders the signed-out app, with no error", async () => {
    backend.mockResolvedValue(json(401, { message: "No refresh cookie" }));
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await screen.findByText("signed out (ready)");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("makes exactly ONE refresh under StrictMode's double effect", async () => {
    backend.mockResolvedValue(json(200, { accessToken: "once" }));

    render(
      <StrictMode>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </StrictMode>,
    );

    await screen.findByText("signed in:once");
    expect(refreshCalls()).toHaveLength(1);
  });

  it("does not refresh when the page already holds a session", async () => {
    seedSession("held");

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await screen.findByText("signed in:held");
    expect(refreshCalls()).toHaveLength(0);
  });
});

describe("useAuth", () => {
  it("re-renders on sign-in and when the session ends (including from another tab)", async () => {
    backend.mockResolvedValue(json(401));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await screen.findByText("signed out (ready)");

    await act(async () => storeSession({ accessToken: "fresh" }));
    expect(await screen.findByText("signed in:fresh")).toBeTruthy();

    await act(async () => clearSession());
    expect(await screen.findByText("signed out (ready)")).toBeTruthy();
  });

  it("signOut calls POST /auth/logout through the cookie and clears the in-memory token", async () => {
    seedSession("held");
    backend.mockResolvedValue(new Response(null, { status: 204 }));
    let signOut!: () => void;
    function Out() {
      signOut = useAuth().signOut;
      return null;
    }
    render(
      <AuthProvider>
        <Out />
      </AuthProvider>,
    );
    await waitFor(() => expect(signOut).toBeTypeOf("function"));

    act(() => signOut());

    expect(getStoredAccessToken()).toBeNull();
    const logout = backend.mock.calls.find(([u]) => u === `${API}/auth/logout`);
    expect(logout).toBeDefined();
    const init = logout![1];
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("X-Auth-Mode")).toBe("cookie");
    expect(init.credentials).toBe("include");
    // No refresh token travels from script: it is in the cookie.
    expect(init.body).toBeUndefined();
  });

  it("works without a provider (a single page mounted on its own)", () => {
    seedSession("solo");
    render(<Probe />);
    expect(screen.getByText("signed in:solo")).toBeTruthy();
  });
});
