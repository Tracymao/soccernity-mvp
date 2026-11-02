// B-278: the sign-in side of user two-factor recovery (Figma 1.2a, 1.2c, 1.3a/b/c, 1.4, 1.5).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import TwoFactorRecoveryRequest from "./TwoFactorRecoveryRequest";
import { RecoveryApiError } from "../../api/twoFactorRecovery";

vi.mock("../../api/twoFactorRecovery", async () => {
  const actual = await vi.importActual<typeof import("../../api/twoFactorRecovery")>("../../api/twoFactorRecovery");
  return { ...actual, requestRecovery: vi.fn() };
});
import { requestRecovery } from "../../api/twoFactorRecovery";

const onBack = vi.fn();
const onBackToLogin = vi.fn();

function open(email = "tobi@example.com") {
  render(
    <MemoryRouter>
      <TwoFactorRecoveryRequest email={email} onBack={onBack} onBackToLogin={onBackToLogin} />
    </MemoryRouter>,
  );
}

async function submitForm(password = "longenough1") {
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  });
}

const stage = () => screen.getByTestId("two-factor-recovery-request").getAttribute("data-stage");
const tooMany = (retryAfterSeconds?: number) =>
  new RecoveryApiError("x", { status: 429, retryAfterSeconds });

beforeEach(() => {
  vi.mocked(requestRecovery).mockReset();
  onBack.mockReset();
  onBackToLogin.mockReset();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("1.2a email and password", () => {
  it("shows the drawn copy, the Copy Tag chip and a prefilled email, and calls nothing yet", () => {
    open();
    expect(screen.getByText("[COPY PENDING LEGAL REVIEW]")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Confirm it’s you" })).not.toBeNull();
    expect(
      screen.getByText("Enter the email and password for your Soccernity account. We’ll email you a link to continue."),
    ).not.toBeNull();
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("tobi@example.com");
    expect(screen.getByPlaceholderText("Enter your password")).not.toBeNull();
    expect(requestRecovery).not.toHaveBeenCalled();
  });

  it("needs both fields before it calls the API", async () => {
    open("");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    });
    expect(screen.getByRole("alert").textContent).toMatch(/enter your email and password/i);
    expect(requestRecovery).not.toHaveBeenCalled();
  });

  it("Back returns to the code prompt", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("posts the trimmed email and the password", async () => {
    vi.mocked(requestRecovery).mockResolvedValue({ audience: "account" });
    open("  tobi@example.com ");
    await submitForm("pw-1");
    expect(requestRecovery).toHaveBeenCalledWith("tobi@example.com", "pw-1");
  });

  it("has NO wrong-details state: the page cannot tell a wrong password from a right one (frame 1.2b is not built)", async () => {
    // The server answers a wrong password with the SAME 202 account answer; the page moves on identically.
    vi.mocked(requestRecovery).mockResolvedValue({ audience: "account" });
    open();
    await submitForm("totally-wrong");
    expect(stage()).toBe("sent");
    expect(screen.queryByText(/those details didn’t work/i)).toBeNull();
  });
});

describe("1.2c too many requests", () => {
  it("a 429 on the first step shows the limit message and keeps the form", async () => {
    vi.mocked(requestRecovery).mockRejectedValue(tooMany(1800));
    open();
    await submitForm();
    expect(stage()).toBe("form");
    expect(screen.getByText("Too many requests")).not.toBeNull();
    expect(screen.getByText("Please wait a while before trying again.")).not.toBeNull();
    expect(screen.getByLabelText("Email")).not.toBeNull();
  });

  it("503 (recovery unavailable) shows a plain error line, not a limit message", async () => {
    vi.mocked(requestRecovery).mockRejectedValue(
      new RecoveryApiError("x", { status: 503, code: "two_factor_recovery_unavailable" }),
    );
    open();
    await submitForm();
    expect(screen.getByRole("alert").textContent).toMatch(/recovery isn’t available right now/i);
    expect(screen.queryByText("Too many requests")).toBeNull();
  });
});

describe("1.3 check your email, and Send again", () => {
  async function reachSent() {
    vi.mocked(requestRecovery).mockResolvedValue({ audience: "account" });
    open();
    await submitForm();
    expect(stage()).toBe("sent");
  }

  it("shows the drawn copy with a 1:00 countdown on Send again (1.3a)", async () => {
    await reachSent();
    expect(screen.getByRole("heading", { name: "Check your email" })).not.toBeNull();
    expect(
      screen.getByText("If those details are right, we’ve emailed a link to the address on your account. Open it to continue."),
    ).not.toBeNull();
    expect(screen.getByText("Can’t find it? Check your spam folder.")).not.toBeNull();
    const send = screen.getByRole("button", { name: "Send again in 1:00" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
  });

  it("counts down once a second and enables Send again at zero (1.3b)", async () => {
    await reachSent();
    await act(async () => {
      vi.advanceTimersByTime(18_000);
    });
    expect(screen.getByRole("button", { name: "Send again in 0:42" })).not.toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(42_000);
    });
    const send = screen.getByRole("button", { name: "Send again" }) as HTMLButtonElement;
    expect(send.disabled).toBe(false);
  });

  it("Send again re-posts the SAME request and restarts the countdown", async () => {
    await reachSent();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    vi.mocked(requestRecovery).mockClear();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send again" }));
    });
    expect(requestRecovery).toHaveBeenCalledWith("tobi@example.com", "longenough1");
    expect(screen.getByRole("button", { name: "Send again in 1:00" })).not.toBeNull();
  });

  it("a 429 with a long Retry-After on Send again shows the limit-reached state (1.3c)", async () => {
    await reachSent();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    vi.mocked(requestRecovery).mockRejectedValue(tooMany(3000));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send again" }));
    });
    expect(screen.getByText("You’ve asked for too many emails")).not.toBeNull();
    expect(screen.getByText("Please try again later.")).not.toBeNull();
    expect((screen.getByRole("button", { name: "Send again" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a 429 with no readable Retry-After also reads as the limit", async () => {
    await reachSent();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    vi.mocked(requestRecovery).mockRejectedValue(tooMany(undefined));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send again" }));
    });
    expect(screen.getByText("You’ve asked for too many emails")).not.toBeNull();
  });

  it("a short Retry-After (the gap, not the hour) restarts the countdown instead of showing the limit", async () => {
    await reachSent();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    vi.mocked(requestRecovery).mockRejectedValue(tooMany(3));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send again" }));
    });
    expect(screen.getByRole("button", { name: "Send again in 0:03" })).not.toBeNull();
    expect(screen.queryByText("You’ve asked for too many emails")).toBeNull();
  });

  it("Back to log in leaves for the log-in form", async () => {
    await reachSent();
    fireEvent.click(screen.getByRole("button", { name: "Back to log in" }));
    expect(onBackToLogin).toHaveBeenCalledTimes(1);
  });

  it("keeps the password out of storage and the address bar", async () => {
    await reachSent();
    const keys = [...Array(window.sessionStorage.length).keys()].map((i) => window.sessionStorage.key(i));
    const lkeys = [...Array(window.localStorage.length).keys()].map((i) => window.localStorage.key(i));
    for (const k of [...keys, ...lkeys]) {
      expect(window.sessionStorage.getItem(k as string) ?? window.localStorage.getItem(k as string)).not.toContain(
        "longenough1",
      );
    }
    expect(window.location.href).not.toContain("longenough1");
    expect(document.cookie).not.toContain("longenough1");
  });
});

describe("1.4 minor, 1.5 minor with no confirmed guardian", () => {
  it("a guardian answer shows 'We’ve asked your guardian', with no Send again", async () => {
    vi.mocked(requestRecovery).mockResolvedValue({ audience: "guardian" });
    open();
    await submitForm();
    expect(stage()).toBe("guardian");
    expect(screen.getByRole("heading", { name: "We’ve asked your guardian" })).not.toBeNull();
    expect(
      screen.getByText(
        "We’ve emailed the guardian on your account. They need to open the link and approve before two-factor is removed.",
      ),
    ).not.toBeNull();
    expect(
      screen.getByText(
        "You don’t need to do anything else. Until then you can still sign in with your authenticator app or a backup code.",
      ),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: /send again/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to log in" }));
    expect(onBackToLogin).toHaveBeenCalled();
  });

  it("no_guardian points to the Contact Us page", async () => {
    vi.mocked(requestRecovery).mockResolvedValue({ audience: "no_guardian" });
    open();
    await submitForm();
    expect(stage()).toBe("no_guardian");
    expect(screen.getByRole("heading", { name: "We can’t send this request yet" })).not.toBeNull();
    expect(
      screen.getByText(
        "We don’t have a confirmed guardian email on your account, so we can’t ask for approval.",
      ),
    ).not.toBeNull();
    expect(screen.getByRole("link", { name: "Contact us" }).getAttribute("href")).toBe("/contact");
  });
});
