// B-087 / B-111: the sign-in code prompt shared by LoginPage and InactiveAccountPage.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import TwoFactorCodePrompt from "./TwoFactorCodePrompt";
import { AuthApiError, type LoginResponse } from "../../api/auth";

vi.mock("../../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../../api/auth")>("../../api/auth");
  return { ...actual, completeTwoFactorLogin: vi.fn() };
});
import { completeTwoFactorLogin } from "../../api/auth";

const SESSION = { accessToken: "acc", user: { id: "u1", nextStep: "none" } } as unknown as LoginResponse;

function err(code: string, status: number) {
  return new AuthApiError("x", { status, code });
}

const onSignedIn = vi.fn();
const onExpired = vi.fn();

function open() {
  render(<TwoFactorCodePrompt challengeToken="chal-1" onSignedIn={onSignedIn} onExpired={onExpired} />);
}

function typeCode(value: string) {
  fireEvent.change(screen.getByLabelText("Digit 1 of 6"), { target: { value } });
}

const CANT_USE = /can.t use your authenticator app\?/i;

beforeEach(() => {
  vi.mocked(completeTwoFactorLogin).mockReset();
  onSignedIn.mockReset();
  onExpired.mockReset();
});
afterEach(cleanup);

describe("code mode (Figma 6711:27530)", () => {
  it("shows the drawn copy, the Copy Tag chip, six boxes, Continue and the backup-code link", () => {
    open();
    expect(screen.getByText("[COPY PENDING LEGAL REVIEW]")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Enter the 6-digit code" })).not.toBeNull();
    expect(screen.getByText("Enter the code shown in your authenticator app for Soccernity.")).not.toBeNull();
    for (let i = 1; i <= 6; i += 1) expect(screen.getByLabelText(`Digit ${i} of 6`)).not.toBeNull();
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: CANT_USE })).not.toBeNull();
  });

  it("a paste into the first box fills all six, ignoring spaces", () => {
    open();
    fireEvent.paste(screen.getByLabelText("Digit 1 of 6"), {
      clipboardData: { getData: () => "482 017" },
    });
    const digits = [1, 2, 3, 4, 5, 6].map((i) => (screen.getByLabelText(`Digit ${i} of 6`) as HTMLInputElement).value);
    expect(digits.join("")).toBe("482017");
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("a paste into a later box of an empty code still fills from the first empty box (no gaps)", () => {
    open();
    fireEvent.paste(screen.getByLabelText("Digit 5 of 6"), {
      clipboardData: { getData: () => "123456" },
    });
    const digits = [1, 2, 3, 4, 5, 6].map((i) => (screen.getByLabelText(`Digit ${i} of 6`) as HTMLInputElement).value);
    expect(digits.join("")).toBe("123456");
  });

  it("typing over one filled box keeps the digits after it", () => {
    open();
    typeCode("482017");
    fireEvent.change(screen.getByLabelText("Digit 2 of 6"), { target: { value: "9" } });
    const digits = [1, 2, 3, 4, 5, 6].map((i) => (screen.getByLabelText(`Digit ${i} of 6`) as HTMLInputElement).value);
    expect(digits.join("")).toBe("492017");
  });

  it("more than six pasted digits are cut at six", () => {
    open();
    fireEvent.paste(screen.getByLabelText("Digit 1 of 6"), {
      clipboardData: { getData: () => "12345678" },
    });
    const digits = [1, 2, 3, 4, 5, 6].map((i) => (screen.getByLabelText(`Digit ${i} of 6`) as HTMLInputElement).value);
    expect(digits.join("")).toBe("123456");
  });

  it("Backspace on an empty box moves focus to the previous box", () => {
    open();
    typeCode("48");
    const third = screen.getByLabelText("Digit 3 of 6");
    third.focus();
    fireEvent.keyDown(third, { key: "Backspace" });
    expect(document.activeElement).toBe(screen.getByLabelText("Digit 2 of 6"));
  });

  it("submits the challenge and the six digits, then hands the session on", async () => {
    vi.mocked(completeTwoFactorLogin).mockResolvedValue(SESSION);
    open();
    typeCode("482017");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(SESSION));
    expect(completeTwoFactorLogin).toHaveBeenCalledWith("chal-1", "482017");
  });

  it("a wrong code shows the drawn message and clears the boxes", async () => {
    vi.mocked(completeTwoFactorLogin).mockRejectedValue(err("two_factor_invalid_code", 401));
    open();
    typeCode("111111");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "That code didn’t work. Check your authenticator app and try again.",
    );
    expect((screen.getByLabelText("Digit 1 of 6") as HTMLInputElement).value).toBe("");
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("a locked account shows the locked message with no countdown", async () => {
    vi.mocked(completeTwoFactorLogin).mockRejectedValue(err("two_factor_code_locked", 429));
    open();
    typeCode("111111");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Too many incorrect codes. Try again later.");
    expect(alert.textContent).not.toMatch(/\d/);
  });

  it("an expired challenge calls onExpired (back to sign-in), not an error line", async () => {
    vi.mocked(completeTwoFactorLogin).mockRejectedValue(err("two_factor_invalid_challenge", 401));
    open();
    typeCode("111111");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(onExpired).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a network failure shows its message", async () => {
    vi.mocked(completeTwoFactorLogin).mockRejectedValue(new AuthApiError("Couldn’t reach the Soccernity server.", {}));
    open();
    typeCode("111111");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn.t reach the soccernity server/i);
  });
});

describe("backup-code mode (Figma 6711:27590 / 6711:27617)", () => {
  function toBackup() {
    open();
    fireEvent.click(screen.getByRole("button", { name: CANT_USE }));
  }

  it("shows the drawn copy, a masked field, Continue and Back", () => {
    toBackup();
    expect(screen.getByRole("heading", { name: "Enter a backup code" })).not.toBeNull();
    expect(screen.getByText("Each backup code works once.")).not.toBeNull();
    const field = screen.getByLabelText("Backup code") as HTMLInputElement;
    expect(field.type).toBe("password");
    expect(field.placeholder).toBe("Enter a code");
    expect(screen.getByRole("button", { name: "Back" })).not.toBeNull();
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("submits the typed backup code (trimmed) with the challenge", async () => {
    vi.mocked(completeTwoFactorLogin).mockResolvedValue(SESSION);
    toBackup();
    fireEvent.change(screen.getByLabelText("Backup code"), { target: { value: "  ABCDE-12345 " } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(SESSION));
    expect(completeTwoFactorLogin).toHaveBeenCalledWith("chal-1", "ABCDE-12345");
  });

  it("a wrong backup code shows the drawn message and clears the field", async () => {
    vi.mocked(completeTwoFactorLogin).mockRejectedValue(err("two_factor_invalid_code", 401));
    toBackup();
    fireEvent.change(screen.getByLabelText("Backup code"), { target: { value: "WRONGWRONG" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "That code didn’t work. Check your backup code and try again.",
    );
    expect((screen.getByLabelText("Backup code") as HTMLInputElement).value).toBe("");
  });

  it("Back returns to the authenticator code and forgets the error", async () => {
    vi.mocked(completeTwoFactorLogin).mockRejectedValue(err("two_factor_invalid_code", 401));
    toBackup();
    fireEvent.change(screen.getByLabelText("Backup code"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Enter the 6-digit code" })).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("an expired challenge calls onExpired from this mode too", async () => {
    vi.mocked(completeTwoFactorLogin).mockRejectedValue(err("two_factor_invalid_challenge", 401));
    toBackup();
    fireEvent.change(screen.getByLabelText("Backup code"), { target: { value: "ABCDE12345" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(onExpired).toHaveBeenCalled());
  });
});

describe("the recovery frames that are deliberately not built", () => {
  it("offers no link to email recovery or to any recovery route", () => {
    open();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryByText(/email and password|check your email|choose a method/i)).toBeNull();
  });
});
