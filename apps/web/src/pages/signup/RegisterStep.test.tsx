// B-074 / B-017 (Decision Log #367): Register shows a read-only date of birth,
// sends the Age Gate country, and persists the session on success.
import type { ComponentProps } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import RegisterStep from "./RegisterStep";

vi.mock("../../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../../api/auth")>("../../api/auth");
  return { ...actual, registerUser: vi.fn() };
});
import { AuthApiError, registerUser } from "../../api/auth";

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(registerUser).mockReset();
});
afterEach(cleanup);

const DOB = { day: "4", month: "9", year: "2011" };

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Tobi" } });
  fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Ade" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "tobi@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "longenough1" } });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
}

function registered(nextStep: "restricted_pending" | "verify_email" | "create_profile" | "none") {
  return {
    accessToken: "acc",
    refreshToken: "ref",
    user: { nextStep },
  } as unknown as Awaited<ReturnType<typeof registerUser>>;
}

function renderStep(props: Partial<ComponentProps<typeof RegisterStep>> = {}) {
  return render(
    <MemoryRouter>
      <RegisterStep dob={DOB} country="GB" isMinor={false} guardianDetails={null} {...props} />
    </MemoryRouter>,
  );
}

describe("RegisterStep", () => {
  it("shows the date of birth read-only, with no date picker", () => {
    renderStep();
    const dob = screen.getByLabelText("Date of Birth") as HTMLInputElement;
    expect(dob.value).toBe("04 / 09 / 2011");
    expect(dob.readOnly).toBe(true);
    expect(screen.queryByRole("button", { name: /calendar|date picker/i })).toBeNull();
  });

  it("has no Apple button", () => {
    renderStep();
    expect(screen.queryByText(/apple/i)).toBeNull();
  });

  it("sends the Age Gate country for an adult, and persists the session", async () => {
    vi.mocked(registerUser).mockResolvedValue(registered("verify_email"));
    renderStep({ dob: { day: "1", month: "1", year: "1990" }, country: "NG" });
    fillAndSubmit();

    await waitFor(() => expect(registerUser).toHaveBeenCalled());
    const payload = vi.mocked(registerUser).mock.calls[0][0];
    expect(payload).toMatchObject({ dateOfBirth: "1990-01-01", countryCode: "NG" });
    expect(payload.guardian).toBeUndefined();
    await waitFor(() => expect(window.sessionStorage.getItem("sn_access_token")).toBe("acc"));
    expect(window.sessionStorage.getItem("sn_refresh_token")).toBe("ref");
  });

  it("sends the single guardian name and the country for a minor", async () => {
    vi.mocked(registerUser).mockResolvedValue(registered("verify_email"));
    renderStep({
      country: "US",
      isMinor: true,
      guardianDetails: { name: "Ada Okafor", email: "ada@example.com", relationship: "Parent" },
    });
    fillAndSubmit();

    await waitFor(() => expect(registerUser).toHaveBeenCalled());
    expect(vi.mocked(registerUser).mock.calls[0][0]).toMatchObject({
      countryCode: "US",
      guardian: { name: "Ada Okafor", email: "ada@example.com", relationship: "Parent" },
    });
  });

  it("does not store a session when registration fails", async () => {
    vi.mocked(registerUser).mockRejectedValue(new AuthApiError("Email already in use", { status: 409 }));
    renderStep();
    fillAndSubmit();

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/already in use/i));
    expect(window.sessionStorage.getItem("sn_access_token")).toBeNull();
  });

  // B-125 (Decision Log #367, #394 A6): where a fresh registration goes is the
  // server's call, never a blanket "club picker".
  describe("routes on the server's nextStep after registering", () => {
    function renderWithRoutes(props: Partial<ComponentProps<typeof RegisterStep>> = {}) {
      return render(
        <MemoryRouter initialEntries={["/signup"]}>
          <Routes>
            <Route
              path="/signup"
              element={<RegisterStep dob={DOB} country="GB" isMinor={false} guardianDetails={null} {...props} />}
            />
            <Route path="/guardian-consent" element={<p>restricted pending page</p>} />
            <Route path="/verify-email/prompt" element={<p>verify prompt page</p>} />
            <Route path="/create-profile" element={<p>create profile page</p>} />
            <Route path="/community" element={<p>community page</p>} />
            <Route path="/signup/clubs" element={<p>club picker page</p>} />
          </Routes>
        </MemoryRouter>,
      );
    }

    it("sends a restricted-pending minor to /guardian-consent, never a club picker or /community", async () => {
      vi.mocked(registerUser).mockResolvedValue(registered("restricted_pending"));
      renderWithRoutes({
        isMinor: true,
        guardianDetails: { name: "Ada Okafor", email: "ada@example.com", relationship: "Parent" },
      });
      fillAndSubmit();

      expect(await screen.findByText("restricted pending page")).not.toBeNull();
      expect(screen.queryByText("club picker page")).toBeNull();
      expect(screen.queryByText("community page")).toBeNull();
    });

    it("sends an unverified adult to the verify-email prompt", async () => {
      vi.mocked(registerUser).mockResolvedValue(registered("verify_email"));
      renderWithRoutes();
      fillAndSubmit();

      expect(await screen.findByText("verify prompt page")).not.toBeNull();
    });

    it("sends create_profile to Create Profile and none to /community", async () => {
      vi.mocked(registerUser).mockResolvedValueOnce(registered("create_profile"));
      const first = renderWithRoutes();
      fillAndSubmit();
      expect(await screen.findByText("create profile page")).not.toBeNull();
      first.unmount();

      vi.mocked(registerUser).mockResolvedValueOnce(registered("none"));
      renderWithRoutes();
      fillAndSubmit();
      expect(await screen.findByText("community page")).not.toBeNull();
    });
  });
});
