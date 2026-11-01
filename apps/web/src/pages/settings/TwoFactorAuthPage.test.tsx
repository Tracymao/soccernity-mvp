// B-087 / B-111: the real Settings > Two-Factor Auth flow (authenticator app), against a mocked
// api/twoFactor. The API layer itself is covered in api/twoFactor.test.ts, and the route under
// the Settings shell in SettingsShell.test.tsx.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import TwoFactorAuthPage from "./TwoFactorAuthPage";
import { AuthApiError } from "../../api/auth";
import { clearSession, seedSession } from "../../test/session";

vi.mock("../../api/twoFactor", () => ({
  getTwoFactorStatus: vi.fn(),
  startTwoFactorEnrolment: vi.fn(),
  confirmTwoFactorEnrolment: vi.fn(),
  regenerateBackupCodes: vi.fn(),
  disableTwoFactor: vi.fn(),
}));
import {
  confirmTwoFactorEnrolment,
  disableTwoFactor,
  getTwoFactorStatus,
  regenerateBackupCodes,
  startTwoFactorEnrolment,
} from "../../api/twoFactor";

const SECRET = "JBSWY3DPEHPK3PXPJBSW";
const URI = `otpauth://totp/Soccernity:ada%40example.com?secret=${SECRET}&issuer=Soccernity`;
const CODES = ["ABCDE12345", "FGHJK23456", "LMNPQ34567", "RSTUV45678", "WXYZA56789", "BCDEF67892", "GHJKL78923", "MNPQR89234", "STUVW92345", "XYZAB23456"];

const OFF = { enabled: false, backupCodesRemaining: 0 };
const ON = { enabled: true, backupCodesRemaining: 10 };

function err(code: string, status: number, message = "x") {
  return new AuthApiError(message, { status, code });
}

function open() {
  return render(
    <MemoryRouter>
      <TwoFactorAuthPage />
    </MemoryRouter>,
  );
}

function typeCode(value: string) {
  const first = screen.getByLabelText("Digit 1 of 6");
  fireEvent.change(first, { target: { value } });
}

let setItemSpy: ReturnType<typeof vi.spyOn>;
let consoleSpies: Array<ReturnType<typeof vi.spyOn>>;

beforeEach(() => {
  clearSession();
  seedSession("access-1");
  window.sessionStorage.clear();
  window.localStorage.clear();
  for (const fn of [
    getTwoFactorStatus,
    startTwoFactorEnrolment,
    confirmTwoFactorEnrolment,
    regenerateBackupCodes,
    disableTwoFactor,
  ]) {
    vi.mocked(fn).mockReset();
  }
  vi.mocked(startTwoFactorEnrolment).mockResolvedValue({ secret: SECRET, otpauthUri: URI });
  setItemSpy = vi.spyOn(Storage.prototype, "setItem");
  consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function nothingSensitiveLeaked() {
  // No storage write, no cookie, and nothing sensitive in any console call.
  expect(setItemSpy).not.toHaveBeenCalled();
  expect(window.sessionStorage.length).toBe(0);
  expect(window.localStorage.length).toBe(0);
  expect(document.cookie).toBe("");
  const logged = JSON.stringify(consoleSpies.flatMap((s) => s.mock.calls));
  expect(logged).not.toContain(SECRET);
  for (const c of CODES) expect(logged).not.toContain(c);
}

describe("signed out", () => {
  it("shows a log-in prompt and calls nothing", () => {
    clearSession();
    open();
    expect(screen.getByText(/log in to manage two-factor authentication/i)).not.toBeNull();
    expect(getTwoFactorStatus).not.toHaveBeenCalled();
  });
});

describe("status", () => {
  it("loads the status, then shows the Authenticator app row off with a Turn on button (no SMS row)", async () => {
    vi.mocked(getTwoFactorStatus).mockResolvedValue(OFF);
    open();
    expect(screen.getByText(/loading your two-factor settings/i)).not.toBeNull();
    expect(await screen.findByText("Authenticator app")).not.toBeNull();
    expect(getTwoFactorStatus).toHaveBeenCalledWith("access-1");
    expect(screen.getByRole("img", { name: "Authenticator app: off" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Turn on" })).not.toBeNull();
    expect(screen.queryByText("Text message")).toBeNull();
    // The Copy Tag chip every frame carries.
    expect(screen.getByText("[COPY PENDING LEGAL REVIEW]")).not.toBeNull();
  });

  it("when on: toggle on, the callout, backup codes left, Turn off and Get new backup codes", async () => {
    vi.mocked(getTwoFactorStatus).mockResolvedValue({ enabled: true, backupCodesRemaining: 7 });
    open();
    expect(await screen.findByRole("img", { name: "Authenticator app: on" })).not.toBeNull();
    expect(
      screen.getByText(/two-factor authentication is on\. you will be asked for a code from your authenticator app/i),
    ).not.toBeNull();
    expect(screen.getByText("7 backup codes left.")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Turn off" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Get new backup codes" })).not.toBeNull();
  });

  it("says '1 backup code left.' in the singular", async () => {
    vi.mocked(getTwoFactorStatus).mockResolvedValue({ enabled: true, backupCodesRemaining: 1 });
    open();
    expect(await screen.findByText("1 backup code left.")).not.toBeNull();
  });

  it("a failed load shows an error and Try again reloads", async () => {
    vi.mocked(getTwoFactorStatus).mockRejectedValueOnce(err("x", 500)).mockResolvedValueOnce(OFF);
    open();
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn.t load your two-factor settings/i);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Turn on" })).not.toBeNull();
    expect(getTwoFactorStatus).toHaveBeenCalledTimes(2);
  });
});

describe("turning on", () => {
  async function toScan() {
    vi.mocked(getTwoFactorStatus).mockResolvedValue(OFF);
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Turn on" }));
    await screen.findByText("Scan the QR code");
  }

  it("step 1: starts enrolment and draws the QR code from the otpauth URI in the browser", async () => {
    await toScan();
    expect(startTwoFactorEnrolment).toHaveBeenCalledWith("access-1");
    expect(screen.getByText("Step 1 of 2")).not.toBeNull();
    expect(screen.getByText("Open your authenticator app and scan this code to add Soccernity.")).not.toBeNull();
    const qr = screen.getByRole("img", { name: /qr code for your authenticator app/i });
    expect(qr.querySelector("svg")).not.toBeNull();
    // The secret is not printed on the scan view.
    expect(screen.queryByText(SECRET)).toBeNull();
  });

  it("Cancel on the scan step goes back to the status and drops the secret", async () => {
    await toScan();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByRole("button", { name: "Turn on" })).not.toBeNull();
    expect(screen.queryByRole("img", { name: /qr code/i })).toBeNull();
  });

  it("'Can't scan?' shows the manual setup key in groups, Copy key copies the raw key, Back returns to the QR", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await toScan();
    fireEvent.click(screen.getByRole("button", { name: /can.t scan\?/i }));
    expect(await screen.findByText("Enter the setup key")).not.toBeNull();
    expect(screen.getByLabelText("Setup key").textContent).toBe("JBSW Y3DP EHPK 3PXP JBSW");
    fireEvent.click(screen.getByRole("button", { name: "Copy key" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SECRET));
    expect(await screen.findByText("Key copied.")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to the QR code" }));
    expect(await screen.findByText("Scan the QR code")).not.toBeNull();
  });

  it("step 2: Continue goes to the six boxes; the button stays disabled until six digits", async () => {
    await toScan();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Enter the 6-digit code")).not.toBeNull();
    expect(screen.getByText("Step 2 of 2")).not.toBeNull();
    const turnOn = screen.getByRole("button", { name: "Turn on two-factor authentication" }) as HTMLButtonElement;
    expect(turnOn.disabled).toBe(true);
    typeCode("48201");
    expect(turnOn.disabled).toBe(true);
    typeCode("482017");
    expect(turnOn.disabled).toBe(false);
    // A paste of "482 017" fills the six boxes.
    expect((screen.getByLabelText("Digit 6 of 6") as HTMLInputElement).value).toBe("7");
  });

  it("Back from the code step returns to the QR code", async () => {
    await toScan();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(await screen.findByRole("button", { name: "Back" }));
    expect(await screen.findByText("Scan the QR code")).not.toBeNull();
  });

  async function toCode() {
    await toScan();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("Enter the 6-digit code");
  }

  it("a wrong code shows the drawn message, clears the boxes, and does not move on", async () => {
    vi.mocked(confirmTwoFactorEnrolment).mockRejectedValue(err("two_factor_invalid_code", 401));
    await toCode();
    typeCode("111111");
    fireEvent.click(screen.getByRole("button", { name: "Turn on two-factor authentication" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "That code didn’t work. Check your authenticator app and try again.",
    );
    expect((screen.getByLabelText("Digit 1 of 6") as HTMLInputElement).value).toBe("");
    expect(screen.queryByText("Save your backup codes")).toBeNull();
  });

  it("a locked account (429) shows the locked message, with no countdown", async () => {
    vi.mocked(confirmTwoFactorEnrolment).mockRejectedValue(err("two_factor_code_locked", 429));
    await toCode();
    typeCode("111111");
    fireEvent.click(screen.getByRole("button", { name: "Turn on two-factor authentication" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Too many incorrect codes. Try again later.");
    expect(alert.textContent).not.toMatch(/\d/);
  });

  it("an expired setup (400) goes back to the status with a plain 'start again' note", async () => {
    vi.mocked(confirmTwoFactorEnrolment).mockRejectedValue(err("two_factor_no_pending_enrolment", 400));
    await toCode();
    typeCode("111111");
    fireEvent.click(screen.getByRole("button", { name: "Turn on two-factor authentication" }));
    expect(await screen.findByText("This setup has expired. Start again.")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Turn on" })).not.toBeNull();
  });

  it("a right code shows the ten backup codes ONCE, formatted 5-5; saving them leads to success, then Done", async () => {
    vi.mocked(confirmTwoFactorEnrolment).mockResolvedValue(CODES);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await toCode();
    typeCode("482017");
    fireEvent.click(screen.getByRole("button", { name: "Turn on two-factor authentication" }));

    expect(await screen.findByText("Save your backup codes")).not.toBeNull();
    expect(confirmTwoFactorEnrolment).toHaveBeenCalledWith("access-1", "482017");
    expect(
      screen.getByText(/these 10 codes are shown once\. each code can be used one time if you cannot use your authenticator app\./i),
    ).not.toBeNull();
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(10);
    expect(within(list).getByLabelText("Code 1").textContent).toBe("ABCDE-12345");
    expect(within(list).getByLabelText("Code 10").textContent).toBe("XYZAB-23456");

    fireEvent.click(screen.getByRole("button", { name: "Copy codes" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toBe(CODES.map((c) => `${c.slice(0, 5)}-${c.slice(5)}`).join("\n"));

    // Backend status after enrolment: on.
    vi.mocked(getTwoFactorStatus).mockResolvedValue(ON);
    fireEvent.click(screen.getByRole("button", { name: "I’ve saved my codes" }));
    expect(await screen.findByText("Two-factor authentication is on")).not.toBeNull();
    expect(screen.getByText("You will be asked for a code from your authenticator app when you log in.")).not.toBeNull();
    // The codes are gone from the page the moment they were confirmed saved.
    expect(screen.queryByLabelText("Code 1")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByRole("button", { name: "Turn off" })).not.toBeNull();
    nothingSensitiveLeaked();
  });
});

describe("regenerating backup codes", () => {
  async function toRegenerate() {
    vi.mocked(getTwoFactorStatus).mockResolvedValue(ON);
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Get new backup codes" }));
    await screen.findByLabelText("Password");
  }

  it("asks for the password; a wrong one shows 'That password is incorrect.' and clears the field", async () => {
    vi.mocked(regenerateBackupCodes).mockRejectedValue(err("two_factor_incorrect_password", 401));
    await toRegenerate();
    const field = screen.getByLabelText("Password") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Get new backup codes" }));
    expect((await screen.findByRole("alert")).textContent).toBe("That password is incorrect.");
    expect(field.value).toBe("");
  });

  it("with the right password shows ten new codes once and returns to the status (not the success screen)", async () => {
    vi.mocked(regenerateBackupCodes).mockResolvedValue(CODES);
    await toRegenerate();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "hunter2hunter2" } });
    fireEvent.click(screen.getByRole("button", { name: "Get new backup codes" }));
    expect(await screen.findByText("Save your backup codes")).not.toBeNull();
    expect(regenerateBackupCodes).toHaveBeenCalledWith("access-1", "hunter2hunter2");
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: "I’ve saved my codes" }));
    expect(await screen.findByRole("button", { name: "Turn off" })).not.toBeNull();
    expect(screen.queryByText("Two-factor authentication is on")).toBeNull();
    expect(screen.queryByLabelText("Code 1")).toBeNull();
    nothingSensitiveLeaked();
  });

  it("Cancel returns to the status", async () => {
    await toRegenerate();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByRole("button", { name: "Turn off" })).not.toBeNull();
    expect(regenerateBackupCodes).not.toHaveBeenCalled();
  });
});

describe("turning off", () => {
  async function toTurnOff() {
    vi.mocked(getTwoFactorStatus).mockResolvedValue(ON);
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Turn off" }));
    await screen.findByText("Turning this off makes your account less secure.");
  }

  it("shows the drawn copy and keeps the button disabled until a password is typed", async () => {
    await toTurnOff();
    expect(screen.getByText("Enter your password to confirm.")).not.toBeNull();
    const submit = screen.getByRole("button", { name: "Turn off two-factor authentication" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "x" } });
    expect(submit.disabled).toBe(false);
  });

  it("a wrong password shows 'That password is incorrect.' and leaves two-factor on", async () => {
    vi.mocked(disableTwoFactor).mockRejectedValue(err("two_factor_incorrect_password", 401));
    await toTurnOff();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Turn off two-factor authentication" }));
    expect((await screen.findByRole("alert")).textContent).toBe("That password is incorrect.");
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("");
  });

  it("the right password turns it off and shows it off", async () => {
    vi.mocked(disableTwoFactor).mockResolvedValue(undefined);
    await toTurnOff();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "hunter2hunter2" } });
    fireEvent.click(screen.getByRole("button", { name: "Turn off two-factor authentication" }));
    expect(await screen.findByText("Two-factor authentication is off.")).not.toBeNull();
    expect(disableTwoFactor).toHaveBeenCalledWith("access-1", "hunter2hunter2");
    expect(screen.getByRole("img", { name: "Authenticator app: off" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Turn on" })).not.toBeNull();
  });

  it("Cancel returns to the status without calling the API", async () => {
    await toTurnOff();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByRole("button", { name: "Turn off" })).not.toBeNull();
    expect(disableTwoFactor).not.toHaveBeenCalled();
  });
});
