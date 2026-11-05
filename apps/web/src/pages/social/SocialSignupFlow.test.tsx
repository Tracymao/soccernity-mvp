// B-085: a NEW person after a social sign-in. Email (Facebook, none shared) -> code -> hand-off -> the EXISTING Age Gate
// and guardian steps -> create account. No step is skipped; the provider's date of birth is never used.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

vi.mock("../../api/socialAuth", async () => {
  const actual = await vi.importActual<typeof import("../../api/socialAuth")>("../../api/socialAuth");
  return {
    ...actual,
    requestSocialEmailCode: vi.fn(),
    verifySocialEmailCode: vi.fn(),
    registerSocial: vi.fn(),
  };
});
import { requestSocialEmailCode, verifySocialEmailCode, registerSocial } from "../../api/socialAuth";
import { AuthApiError } from "../../api/auth";
import { clearSession, heldAccessToken } from "../../test/session";
import SocialSignupFlow from "./SocialSignupFlow";

const FACEBOOK_NO_EMAIL = { displayName: "Jane Doe", email: null, emailVerified: false, needsEmail: true };
const GOOGLE_WITH_EMAIL = { displayName: "Jane Doe", email: "jane@example.com", emailVerified: true, needsEmail: false };

beforeEach(() => {
  clearSession();
  vi.mocked(requestSocialEmailCode).mockReset();
  vi.mocked(verifySocialEmailCode).mockReset();
  vi.mocked(registerSocial).mockReset();
});
afterEach(cleanup);

function renderFlow(provider: "google" | "facebook", profile: typeof GOOGLE_WITH_EMAIL | typeof FACEBOOK_NO_EMAIL) {
  return render(
    <MemoryRouter initialEntries={["/flow"]}>
      <Routes>
        <Route
          path="/flow"
          element={<SocialSignupFlow provider={provider} socialRegistrationToken="rt" profile={profile} />}
        />
        <Route path="/login" element={<p>login page</p>} />
        <Route path="/create-profile" element={<p>create profile page</p>} />
        <Route path="/guardian-consent" element={<p>restricted pending page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function fillAgeGate(day: string, month: string, year: string) {
  fireEvent.change(screen.getByLabelText("Day of birth"), { target: { value: day } });
  fireEvent.change(screen.getByLabelText("Month of birth"), { target: { value: month } });
  fireEvent.change(screen.getByLabelText("Year of birth"), { target: { value: year } });
  fireEvent.change(screen.getByLabelText("Country you live in"), { target: { value: "GB" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

function registered(nextStep: string) {
  return { accessToken: "acc", user: { nextStep } } as unknown as Awaited<ReturnType<typeof registerSocial>>;
}

describe("Enter your email (Facebook shared none)", () => {
  it("starts on the email screen with the drawn wording (a code, not a link)", () => {
    renderFlow("facebook", FACEBOOK_NO_EMAIL);
    expect(screen.getByRole("heading", { name: "Enter your email" })).not.toBeNull();
    expect(
      screen.getByText(/Facebook didn.t share an email address with us\. Enter the one you want to use and we.ll send you a code to confirm it\./),
    ).not.toBeNull();
    expect(screen.getByLabelText("Email")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Use a different sign-in method" }).getAttribute("href")).toBe("/login");
  });

  it("shows the drawn invalid-email message and sends nothing", () => {
    renderFlow("facebook", FACEBOOK_NO_EMAIL);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jane.doe@" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert").textContent).toBe("Enter a valid email address, for example name@example.com.");
    expect(screen.getByLabelText("Email").getAttribute("aria-invalid")).toBe("true");
    expect(requestSocialEmailCode).not.toHaveBeenCalled();
  });

  it("sends the code and moves to the code screen", async () => {
    vi.mocked(requestSocialEmailCode).mockResolvedValue(undefined);
    renderFlow("facebook", FACEBOOK_NO_EMAIL);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: " jane@example.com " } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: "Check your email" })).not.toBeNull();
    expect(requestSocialEmailCode).toHaveBeenCalledWith("rt", "jane@example.com");
    expect(screen.getByText(/We sent a 6-digit code to jane@example\.com/)).not.toBeNull();
  });

  it("says so when too many codes were requested", async () => {
    vi.mocked(requestSocialEmailCode).mockRejectedValue(
      new AuthApiError("x", { status: 429, code: "social_email_code_rate_limited" }),
    );
    renderFlow("facebook", FACEBOOK_NO_EMAIL);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jane@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Too many codes have been requested/);
  });

  it("shows the expired screen when the registration token has run out", async () => {
    vi.mocked(requestSocialEmailCode).mockRejectedValue(
      new AuthApiError("x", { status: 400, code: "social_registration_invalid" }),
    );
    renderFlow("facebook", FACEBOOK_NO_EMAIL);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jane@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: "This sign-in has expired" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Back to log in" }).getAttribute("href")).toBe("/login");
  });
});

describe("Enter the code", () => {
  async function toCodeScreen() {
    vi.mocked(requestSocialEmailCode).mockResolvedValue(undefined);
    renderFlow("facebook", FACEBOOK_NO_EMAIL);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jane@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Check your email" });
  }

  it("rejects a code that is not 6 digits without a request", async () => {
    await toCodeScreen();
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "12ab" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert").textContent).toBe("Enter the 6-digit code from the email.");
    expect(verifySocialEmailCode).not.toHaveBeenCalled();
  });

  it("shows a wrong code and lets the person ask for a new one", async () => {
    await toCodeScreen();
    vi.mocked(verifySocialEmailCode).mockRejectedValue(
      new AuthApiError("x", { status: 400, code: "social_email_code_invalid" }),
    );
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/That code didn.t work/);

    fireEvent.click(screen.getByRole("button", { name: "Send a new code" }));
    await waitFor(() => expect(requestSocialEmailCode).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("We sent a new code.")).not.toBeNull();
  });

  it("goes back to the email screen to use a different address", async () => {
    await toCodeScreen();
    fireEvent.click(screen.getByRole("button", { name: "Use a different email" }));
    expect(screen.getByRole("heading", { name: "Enter your email" })).not.toBeNull();
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("jane@example.com");
  });

  it("a right code leads to the hand-off, not to account creation", async () => {
    await toCodeScreen();
    vi.mocked(verifySocialEmailCode).mockResolvedValue({ email: "jane@example.com" });
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: "One more step" })).not.toBeNull();
    expect(registerSocial).not.toHaveBeenCalled();
  });
});

describe("Hand-off to the Age Gate", () => {
  it("a person whose provider gave an email starts here, with the drawn wording", () => {
    renderFlow("google", GOOGLE_WITH_EMAIL);
    expect(screen.getByRole("heading", { name: "One more step" })).not.toBeNull();
    expect(screen.getByText("Before we create your account, we need to check your age.")).not.toBeNull();
    expect(
      screen.getByText(/Next you.ll enter your date of birth and country\. We don.t use a date of birth from Google or Facebook\. \[COPY PENDING LEGAL REVIEW\]/),
    ).not.toBeNull();
    expect(requestSocialEmailCode).not.toHaveBeenCalled();
  });

  it("Cancel goes back to log in", () => {
    renderFlow("google", GOOGLE_WITH_EMAIL);
    expect(screen.getByRole("link", { name: "Cancel" }).getAttribute("href")).toBe("/login");
  });

  it("Continue opens the existing Age Gate", () => {
    renderFlow("google", GOOGLE_WITH_EMAIL);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Date of birth and country" })).not.toBeNull();
  });
});

describe("an adult", () => {
  it("goes Age Gate -> create account and registers with the token, name, date of birth and country (no email, no password)", async () => {
    vi.mocked(registerSocial).mockResolvedValue(registered("create_profile"));
    renderFlow("google", GOOGLE_WITH_EMAIL);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fillAgeGate("4", "9", "1990");

    expect(await screen.findByRole("heading", { name: "Create your account" })).not.toBeNull();
    expect((screen.getByLabelText("First name") as HTMLInputElement).value).toBe("Jane");
    expect((screen.getByLabelText("Last name") as HTMLInputElement).value).toBe("Doe");
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("jane@example.com");
    expect((screen.getByLabelText("Email") as HTMLInputElement).readOnly).toBe(true);
    expect((screen.getByLabelText("Date of Birth") as HTMLInputElement).value).toBe("04 / 09 / 1990");
    expect(screen.queryByLabelText("Password")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("create profile page")).not.toBeNull();
    expect(registerSocial).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(registerSocial).mock.calls[0][0];
    expect(payload).toEqual({
      socialRegistrationToken: "rt",
      displayName: "Jane Doe",
      dateOfBirth: "1990-09-04",
      countryCode: "GB",
    });
    expect(payload).not.toHaveProperty("guardian");
    expect(heldAccessToken()).toBe("acc");
  });

  it("makes the person give a full name", async () => {
    renderFlow("google", { ...GOOGLE_WITH_EMAIL, displayName: "Jane" });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fillAgeGate("4", "9", "1990");
    await screen.findByRole("heading", { name: "Create your account" });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("alert").textContent).toBe("Enter your full name.");
    expect(registerSocial).not.toHaveBeenCalled();
  });

  it("shows one generic message when the server cannot create the account", async () => {
    vi.mocked(registerSocial).mockRejectedValue(
      new AuthApiError("x", { status: 409, code: "social_signup_unavailable" }),
    );
    renderFlow("google", GOOGLE_WITH_EMAIL);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fillAgeGate("4", "9", "1990");
    await screen.findByRole("heading", { name: "Create your account" });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /couldn.t create an account with this sign-in\. If you already have a Soccernity account, log in with your email and password\./,
    );
    expect(heldAccessToken()).toBeNull();
  });

  it("shows the expired screen when the token ran out before the last step", async () => {
    vi.mocked(registerSocial).mockRejectedValue(
      new AuthApiError("x", { status: 400, code: "social_registration_invalid" }),
    );
    renderFlow("google", GOOGLE_WITH_EMAIL);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fillAgeGate("4", "9", "1990");
    await screen.findByRole("heading", { name: "Create your account" });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("heading", { name: "This sign-in has expired" })).not.toBeNull();
  });
});

describe("a minor", () => {
  it("must go through the guardian details step and sends the guardian, then lands on Restricted Pending", async () => {
    vi.mocked(registerSocial).mockResolvedValue(registered("restricted_pending"));
    renderFlow("google", GOOGLE_WITH_EMAIL);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fillAgeGate("4", "9", "2012");

    // The existing guardian step: it cannot be skipped.
    expect(await screen.findByLabelText("Guardian’s full name")).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Create your account" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Guardian’s full name"), { target: { value: "Ade Doe" } });
    fireEvent.change(screen.getByLabelText("Guardian’s email address"), { target: { value: "ade@example.com" } });
    fireEvent.change(screen.getByLabelText("Their relationship to you"), { target: { value: "Parent" } });
    fireEvent.click(screen.getByRole("button", { name: "Send approval request" }));

    expect(await screen.findByRole("heading", { name: "Create your account" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("restricted pending page")).not.toBeNull();
    expect(vi.mocked(registerSocial).mock.calls[0][0]).toEqual({
      socialRegistrationToken: "rt",
      displayName: "Jane Doe",
      dateOfBirth: "2012-09-04",
      countryCode: "GB",
      guardian: { name: "Ade Doe", email: "ade@example.com", relationship: "Parent" },
    });
  });

  it("a below-minimum-age person is stopped at the Age Gate and nothing is registered", () => {
    renderFlow("google", GOOGLE_WITH_EMAIL);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const year = String(new Date().getFullYear() - 3);
    fillAgeGate("4", "9", year);
    expect(screen.getByRole("heading", { name: "Soccernity isn’t for you just yet" })).not.toBeNull();
    expect(registerSocial).not.toHaveBeenCalled();
  });
});

it("never offers Apple anywhere in the flow", () => {
  renderFlow("facebook", FACEBOOK_NO_EMAIL);
  expect(screen.queryByText(/apple/i)).toBeNull();
});
