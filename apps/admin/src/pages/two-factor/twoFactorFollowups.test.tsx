// B-271 follow-ups: Turn off with enforcement OFF on the profile card (Figma 6906:33681 to 6906:34113), the Edit admin
// two-factor card driven by twoFactorEnabled (Figma 6907:34127, 6908:34249), and the error-code (not message-text)
// handling of the three wrong-credential answers.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import TwoFactorCard from "./TwoFactorCard";
import ResetTwoFactorCard from "./ResetTwoFactorCard";
import * as copy from "./twoFactorCopy";
import { AdminApiError } from "../../api/adminClient";
import { seedAdminSession } from "../../test/session";

vi.mock("../../api/adminTwoFactor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/adminTwoFactor")>();
  return {
    ...actual,
    getAdminTwoFactorStatus: vi.fn(),
    regenerateAdminBackupCodes: vi.fn(),
    disableAdminTwoFactor: vi.fn(),
    resetAdminTwoFactor: vi.fn(),
  };
});
import {
  disableAdminTwoFactor,
  getAdminTwoFactorStatus,
  regenerateAdminBackupCodes,
  resetAdminTwoFactor,
} from "../../api/adminTwoFactor";

function tokenFor(sub: string): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${b64({ alg: "HS256" })}.${b64({ sub, role: "superadmin", aud: "admin-console" })}.sig`;
}

beforeEach(() => {
  vi.mocked(getAdminTwoFactorStatus).mockReset();
  vi.mocked(regenerateAdminBackupCodes).mockReset();
  vi.mocked(disableAdminTwoFactor).mockReset();
  vi.mocked(resetAdminTwoFactor).mockReset();
});
afterEach(cleanup);

const WRONG_PASSWORD = { code: "two_factor_incorrect_password" };

describe("Profile card, enforcement off: Turn off", () => {
  async function renderOn(enforced: boolean | undefined) {
    const status = { enabled: true, backupCodesRemaining: 8 } as { enabled: boolean; backupCodesRemaining: number; enforced: boolean };
    if (enforced !== undefined) status.enforced = enforced;
    vi.mocked(getAdminTwoFactorStatus).mockResolvedValue(status);
    render(<TwoFactorCard />);
    await screen.findByText("8 of 10");
  }

  it("enforced=false offers Regenerate and Turn off side by side, and no 'required' note (6906:33681)", async () => {
    await renderOn(false);
    expect(screen.getByRole("button", { name: copy.REGENERATE_BUTTON })).not.toBeNull();
    expect(screen.getByRole("button", { name: copy.TURN_OFF_BUTTON })).not.toBeNull();
    expect(screen.queryByText(copy.CARD_REQUIRED_NOTE)).toBeNull();
  });

  it("enforced=true keeps the card unchanged: the 'required' note, Regenerate, and no Turn off (6902:32565)", async () => {
    await renderOn(true);
    expect(screen.getByText(copy.CARD_REQUIRED_NOTE)).not.toBeNull();
    expect(screen.getByRole("button", { name: copy.REGENERATE_BUTTON })).not.toBeNull();
    expect(screen.queryByRole("button", { name: copy.TURN_OFF_BUTTON })).toBeNull();
  });

  it("a status answer without the enforced field is read as enforced: no Turn off", async () => {
    await renderOn(undefined);
    expect(screen.queryByRole("button", { name: copy.TURN_OFF_BUTTON })).toBeNull();
    expect(screen.getByText(copy.CARD_REQUIRED_NOTE)).not.toBeNull();
  });

  async function openTurnOff() {
    await renderOn(false);
    fireEvent.click(screen.getByRole("button", { name: copy.TURN_OFF_BUTTON }));
    return screen.getByRole("dialog", { name: copy.TURN_OFF_TITLE });
  }

  it("the dialog asks for the password with the warning; Turn off stays disabled until typed (6906:33808)", async () => {
    const dialog = await openTurnOff();
    expect(within(dialog).getByText(copy.TURN_OFF_BODY)).not.toBeNull();
    expect(within(dialog).getByText(copy.TURN_OFF_WARNING)).not.toBeNull();
    expect((within(dialog).getByRole("button", { name: copy.TURN_OFF_CONFIRM }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("Password"), { target: { value: "x" } });
    expect((within(dialog).getByRole("button", { name: copy.TURN_OFF_CONFIRM }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("Cancel and Escape close the dialog and call nothing", async () => {
    const dialog = await openTurnOff();
    fireEvent.click(within(dialog).getByRole("button", { name: copy.CANCEL }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: copy.TURN_OFF_BUTTON }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(disableAdminTwoFactor).not.toHaveBeenCalled();
  });

  it("success: sends the password, closes the dialog, shows the 'turned off' banner and an Off card with no actions (6906:34113)", async () => {
    vi.mocked(disableAdminTwoFactor).mockResolvedValue(undefined);
    const dialog = await openTurnOff();
    fireEvent.change(within(dialog).getByLabelText("Password"), { target: { value: "hunter2hunter2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: copy.TURN_OFF_CONFIRM }));
    expect(await screen.findByText(copy.TURNED_OFF_TITLE)).not.toBeNull();
    expect(disableAdminTwoFactor).toHaveBeenCalledWith("hunter2hunter2");
    expect(screen.getByText(copy.TURNED_OFF_BODY)).not.toBeNull();
    expect(screen.getByText(copy.CARD_TURNED_OFF_BODY)).not.toBeNull();
    expect(screen.getByText(copy.STATUS_OFF)).not.toBeNull();
    expect(screen.queryByText(copy.STATUS_ON)).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: copy.REGENERATE_BUTTON })).toBeNull();
    expect(screen.queryByRole("button", { name: copy.TURN_OFF_BUTTON })).toBeNull();
  });

  it("an incorrect password (by code) shows the wording and keeps the dialog (6906:33959)", async () => {
    // The server's own text differs from ours on purpose: the screen decides by the code, not the message.
    vi.mocked(disableAdminTwoFactor).mockRejectedValue(new AdminApiError(401, "Something else entirely", WRONG_PASSWORD));
    const dialog = await openTurnOff();
    fireEvent.change(within(dialog).getByLabelText("Password"), { target: { value: "nope-nope-nope" } });
    fireEvent.click(within(dialog).getByRole("button", { name: copy.TURN_OFF_CONFIRM }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe(copy.INCORRECT_PASSWORD);
    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(screen.queryByText(copy.TURNED_OFF_TITLE)).toBeNull();
  });

  it("a 401 that merely says 'Incorrect password' but carries no code is NOT treated as a wrong password", async () => {
    vi.mocked(disableAdminTwoFactor).mockRejectedValue(new AdminApiError(401, "Incorrect password"));
    const dialog = await openTurnOff();
    fireEvent.change(within(dialog).getByLabelText("Password"), { target: { value: "nope-nope-nope" } });
    fireEvent.click(within(dialog).getByRole("button", { name: copy.TURN_OFF_CONFIRM }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe(copy.TURN_OFF_FAILED);
  });

  it("403 admin_two_factor_required (enforcement was switched on): the dialog closes and the status is reloaded as enforced", async () => {
    vi.mocked(disableAdminTwoFactor).mockRejectedValue(
      new AdminApiError(403, "Two-factor authentication is required for admin accounts and cannot be turned off.", {
        code: "admin_two_factor_required",
      }),
    );
    const dialog = await openTurnOff();
    vi.mocked(getAdminTwoFactorStatus).mockResolvedValue({ enabled: true, backupCodesRemaining: 8, enforced: true });
    fireEvent.change(within(dialog).getByLabelText("Password"), { target: { value: "hunter2hunter2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: copy.TURN_OFF_CONFIRM }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText(copy.CARD_REQUIRED_NOTE)).not.toBeNull();
    expect(screen.queryByRole("button", { name: copy.TURN_OFF_BUTTON })).toBeNull();
  });

  it("any other failure shows a plain failure line and keeps the dialog", async () => {
    vi.mocked(disableAdminTwoFactor).mockRejectedValue(new AdminApiError(500, "boom"));
    const dialog = await openTurnOff();
    fireEvent.change(within(dialog).getByLabelText("Password"), { target: { value: "hunter2hunter2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: copy.TURN_OFF_CONFIRM }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe(copy.TURN_OFF_FAILED);
  });
});

describe("Regenerate: the wrong password is decided by code", () => {
  async function openRegenerate() {
    vi.mocked(getAdminTwoFactorStatus).mockResolvedValue({ enabled: true, backupCodesRemaining: 8, enforced: true });
    render(<TwoFactorCard />);
    fireEvent.click(await screen.findByRole("button", { name: copy.REGENERATE_BUTTON }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Password"), { target: { value: "hunter2hunter2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: copy.REGENERATE_CONFIRM }));
    return dialog;
  }

  it("a coded wrong password shows the wording whatever the server text says", async () => {
    vi.mocked(regenerateAdminBackupCodes).mockRejectedValue(new AdminApiError(401, "Different words", WRONG_PASSWORD));
    const dialog = await openRegenerate();
    expect((await within(dialog).findByRole("alert")).textContent).toBe(copy.INCORRECT_PASSWORD);
  });

  it("a 401 without the code is the plain failure line", async () => {
    vi.mocked(regenerateAdminBackupCodes).mockRejectedValue(new AdminApiError(401, "Incorrect password"));
    const dialog = await openRegenerate();
    expect((await within(dialog).findByRole("alert")).textContent).toBe(copy.REGENERATE_FAILED);
  });
});

describe("Edit admin card: driven by twoFactorEnabled", () => {
  it("on: shows the On pill, the on line and the reset explanation, and Reset is enabled (6907:34127)", () => {
    render(<ResetTwoFactorCard adminId="admin-2" adminName="Amara Okafor" twoFactorEnabled />);
    expect(screen.getByText(copy.STATUS_ON)).not.toBeNull();
    expect(screen.getByText(copy.RESET_ON_BODY)).not.toBeNull();
    expect(screen.getByText(copy.RESET_CARD_BODY)).not.toBeNull();
    expect((screen.getByRole("button", { name: copy.RESET_BUTTON }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("off: shows the Off pill, the off line and the reason, and Reset is disabled and opens nothing (6908:34249)", () => {
    render(<ResetTwoFactorCard adminId="admin-2" adminName="Amara Okafor" twoFactorEnabled={false} />);
    expect(screen.getByText(copy.STATUS_OFF)).not.toBeNull();
    expect(screen.getByText(copy.RESET_OFF_BODY)).not.toBeNull();
    expect(screen.getByText(copy.RESET_UNAVAILABLE)).not.toBeNull();
    expect(screen.queryByText(copy.RESET_CARD_BODY)).toBeNull();
    const button = screen.getByRole("button", { name: copy.RESET_BUTTON }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(resetAdminTwoFactor).not.toHaveBeenCalled();
  });

  it("without the prop the card behaves as before: no pill, Reset offered", () => {
    render(<ResetTwoFactorCard adminId="admin-2" adminName="Amara Okafor" />);
    expect(screen.queryByText(copy.STATUS_ON)).toBeNull();
    expect(screen.queryByText(copy.STATUS_OFF)).toBeNull();
    expect((screen.getByRole("button", { name: copy.RESET_BUTTON }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("a successful reset tells the page (onTwoFactorOff) and shows the done banner (6908:34466)", async () => {
    vi.mocked(resetAdminTwoFactor).mockResolvedValue({ id: "admin-2", twoFactorEnabled: false });
    const onOff = vi.fn();
    const { rerender } = render(
      <ResetTwoFactorCard adminId="admin-2" adminName="Amara Okafor" twoFactorEnabled onTwoFactorOff={onOff} />,
    );
    fireEvent.click(screen.getByRole("button", { name: copy.RESET_BUTTON }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: copy.RESET_CONFIRM_BUTTON }));
    expect(await screen.findByText(copy.RESET_DONE_TITLE)).not.toBeNull();
    expect(onOff).toHaveBeenCalledTimes(1);
    // The page flips the prop; the card then reads Off with Reset disabled, and keeps the banner.
    rerender(
      <ResetTwoFactorCard adminId="admin-2" adminName="Amara Okafor" twoFactorEnabled={false} onTwoFactorOff={onOff} />,
    );
    expect(screen.getByText(copy.STATUS_OFF)).not.toBeNull();
    expect(screen.getByText(copy.RESET_DONE_TITLE)).not.toBeNull();
    expect((screen.getByRole("button", { name: copy.RESET_BUTTON }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a 409 two_factor_not_enabled from a stale list still shows the nothing-to-reset banner and tells the page", async () => {
    vi.mocked(resetAdminTwoFactor).mockRejectedValue(
      new AdminApiError(409, "Two-factor authentication is not turned on.", { code: "two_factor_not_enabled" }),
    );
    const onOff = vi.fn();
    render(<ResetTwoFactorCard adminId="admin-2" adminName="Amara Okafor" twoFactorEnabled onTwoFactorOff={onOff} />);
    fireEvent.click(screen.getByRole("button", { name: copy.RESET_BUTTON }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: copy.RESET_CONFIRM_BUTTON }));
    expect(await screen.findByText(copy.RESET_NOTHING)).not.toBeNull();
    expect(onOff).toHaveBeenCalledTimes(1);
  });

  it("your own record keeps its behaviour: Reset disabled with the own-account message once the API refuses it", async () => {
    seedAdminSession(tokenFor("admin-1"));
    render(<ResetTwoFactorCard adminId="admin-1" adminName="Me" twoFactorEnabled />);
    expect(screen.getByText(copy.RESET_OWN_ACCOUNT)).not.toBeNull();
    expect((screen.getByRole("button", { name: copy.RESET_BUTTON }) as HTMLButtonElement).disabled).toBe(true);
  });
});
