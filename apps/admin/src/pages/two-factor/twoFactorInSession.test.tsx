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
    resetAdminTwoFactor: vi.fn(),
  };
});
import {
  getAdminTwoFactorStatus,
  regenerateAdminBackupCodes,
  resetAdminTwoFactor,
} from "../../api/adminTwoFactor";

const CODES = ["ABCDE23456", "FGHJK23456", "LMNPQ23456", "RSTUV23456", "WXYZA23456", "BCDEF23456", "GHJKL23456", "MNPQR23456", "STUVW23456", "XYZAB23456"];

// An access token whose payload names `sub`; the signature is never checked client-side.
function tokenFor(sub: string): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${b64({ alg: "HS256" })}.${b64({ sub, role: "superadmin", aud: "admin-console" })}.sig`;
}

beforeEach(() => {
  vi.mocked(getAdminTwoFactorStatus).mockReset();
  vi.mocked(regenerateAdminBackupCodes).mockReset();
  vi.mocked(resetAdminTwoFactor).mockReset();
});
afterEach(cleanup);

describe("Admin Profile two-factor card", () => {
  it("shows On, the remaining backup codes and no Turn off control", async () => {
    vi.mocked(getAdminTwoFactorStatus).mockResolvedValue({ enabled: true, backupCodesRemaining: 8, enforced: true });
    render(<TwoFactorCard />);
    expect(screen.getByText(copy.LOADING_STATUS)).not.toBeNull();
    expect(await screen.findByText(copy.STATUS_ON)).not.toBeNull();
    expect(screen.getByText(copy.CARD_ON_BODY)).not.toBeNull();
    expect(screen.getByText(copy.BACKUP_REMAINING_LABEL)).not.toBeNull();
    expect(screen.getByText("8 of 10")).not.toBeNull();
    expect(screen.getByText(copy.CARD_REQUIRED_NOTE)).not.toBeNull();
    expect(screen.getByRole("button", { name: copy.REGENERATE_BUTTON })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /turn off|disable/i })).toBeNull();
  });

  it("a status that cannot be loaded shows the error with Try again, which loads it again", async () => {
    vi.mocked(getAdminTwoFactorStatus).mockRejectedValueOnce(new Error("offline"));
    vi.mocked(getAdminTwoFactorStatus).mockResolvedValueOnce({ enabled: true, backupCodesRemaining: 10, enforced: true });
    render(<TwoFactorCard />);
    expect((await screen.findByRole("alert")).textContent).toBe(copy.STATUS_LOAD_ERROR);
    expect(screen.queryByRole("button", { name: copy.REGENERATE_BUTTON })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: copy.TRY_AGAIN }));
    expect(await screen.findByText("10 of 10")).not.toBeNull();
    expect(getAdminTwoFactorStatus).toHaveBeenCalledTimes(2);
  });

  it("an admin without two-factor sees a plain Off state and no Regenerate button", async () => {
    vi.mocked(getAdminTwoFactorStatus).mockResolvedValue({ enabled: false, backupCodesRemaining: 0, enforced: true });
    render(<TwoFactorCard />);
    expect(await screen.findByText(copy.CARD_OFF_BODY)).not.toBeNull();
    expect(screen.queryByRole("button", { name: copy.REGENERATE_BUTTON })).toBeNull();
  });

  async function openRegenerate() {
    vi.mocked(getAdminTwoFactorStatus).mockResolvedValue({ enabled: true, backupCodesRemaining: 8, enforced: true });
    render(<TwoFactorCard />);
    fireEvent.click(await screen.findByRole("button", { name: copy.REGENERATE_BUTTON }));
    return screen.getByRole("dialog");
  }

  it("Regenerate asks for the password in a dialog, and Cancel closes it", async () => {
    const dialog = await openRegenerate();
    expect(within(dialog).getByText(copy.REGENERATE_BODY)).not.toBeNull();
    expect((within(dialog).getByRole("button", { name: copy.REGENERATE_CONFIRM }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: copy.CANCEL }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(regenerateAdminBackupCodes).not.toHaveBeenCalled();
  });

  it("Escape closes the password dialog", async () => {
    await openRegenerate();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("an incorrect password (two_factor_incorrect_password) shows the wording and keeps the dialog", async () => {
    vi.mocked(regenerateAdminBackupCodes).mockRejectedValue(new AdminApiError(401, "Incorrect password", { code: "two_factor_incorrect_password" }));
    const dialog = await openRegenerate();
    fireEvent.change(within(dialog).getByLabelText("Password"), { target: { value: "wrong-password" } });
    fireEvent.click(within(dialog).getByRole("button", { name: copy.REGENERATE_CONFIRM }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe(copy.INCORRECT_PASSWORD);
    expect(screen.getByRole("dialog")).not.toBeNull();
  });

  it("any other failure shows a plain failure line", async () => {
    vi.mocked(regenerateAdminBackupCodes).mockRejectedValue(new AdminApiError(500, "boom"));
    const dialog = await openRegenerate();
    fireEvent.change(within(dialog).getByLabelText("Password"), { target: { value: "hunter2hunter2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: copy.REGENERATE_CONFIRM }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe(copy.REGENERATE_FAILED);
  });

  it("new codes are shown once: Done stays disabled until saved, Escape does not close, then the status reloads", async () => {
    vi.mocked(regenerateAdminBackupCodes).mockResolvedValue({ backupCodes: CODES });
    const dialog = await openRegenerate();
    fireEvent.change(within(dialog).getByLabelText("Password"), { target: { value: "hunter2hunter2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: copy.REGENERATE_CONFIRM }));
    expect(await screen.findByRole("heading", { name: copy.NEW_CODES_TITLE })).not.toBeNull();
    expect(regenerateAdminBackupCodes).toHaveBeenCalledWith("hunter2hunter2");
    expect(screen.getByText(copy.NEW_CODES_BODY)).not.toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(10);

    const done = screen.getByRole("button", { name: copy.DONE }) as HTMLButtonElement;
    expect(done.disabled).toBe(true);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("dialog")).not.toBeNull();

    vi.mocked(getAdminTwoFactorStatus).mockResolvedValue({ enabled: true, backupCodesRemaining: 10, enforced: true });
    fireEvent.click(screen.getByLabelText(copy.SAVED_CODES_LABEL));
    fireEvent.click(done);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(await screen.findByText("10 of 10")).not.toBeNull();
  });
});

describe("Edit admin: Reset two-factor", () => {
  function renderCard(adminId = "admin-2") {
    return render(<ResetTwoFactorCard adminId={adminId} adminName="Amara Okafor" />);
  }

  it("explains the reset and offers the button", () => {
    renderCard();
    expect(screen.getByText(copy.RESET_CARD_BODY)).not.toBeNull();
    expect((screen.getByRole("button", { name: copy.RESET_BUTTON }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("opens a confirmation naming the admin, and Cancel resets nothing", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: copy.RESET_BUTTON }));
    const dialog = screen.getByRole("dialog", { name: copy.resetDialogTitle("Amara Okafor") });
    expect(within(dialog).getByText(copy.RESET_DIALOG_BODY)).not.toBeNull();
    expect(within(dialog).getByText(copy.RESET_ALERT_TITLE)).not.toBeNull();
    expect(within(dialog).getByText(copy.RESET_ALERT_BODY)).not.toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: copy.CANCEL }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(resetAdminTwoFactor).not.toHaveBeenCalled();
  });

  it("Escape closes the confirmation and focus returns to the Reset button", () => {
    renderCard();
    const opener = screen.getByRole("button", { name: copy.RESET_BUTTON });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("confirming resets via the API, closes the dialog and shows the done banner", async () => {
    vi.mocked(resetAdminTwoFactor).mockResolvedValue({ id: "admin-2", twoFactorEnabled: false });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: copy.RESET_BUTTON }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: copy.RESET_CONFIRM_BUTTON }));
    expect(await screen.findByText(copy.RESET_DONE_TITLE)).not.toBeNull();
    expect(screen.getByText(copy.resetDoneBody("Amara Okafor"))).not.toBeNull();
    expect(resetAdminTwoFactor).toHaveBeenCalledWith("admin-2");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a 409 two_factor_not_enabled shows the nothing-to-reset banner", async () => {
    vi.mocked(resetAdminTwoFactor).mockRejectedValue(
      new AdminApiError(409, "This admin does not have two-factor authentication turned on.", {
        code: "two_factor_not_enabled",
      }),
    );
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: copy.RESET_BUTTON }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: copy.RESET_CONFIRM_BUTTON }));
    expect(await screen.findByText(copy.RESET_NOTHING)).not.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText(copy.RESET_DONE_TITLE)).toBeNull();
  });

  it("a 403 cannot_reset_own_two_factor from the API shows the own-account message and disables Reset", async () => {
    vi.mocked(resetAdminTwoFactor).mockRejectedValue(
      new AdminApiError(403, "You cannot reset your own two-factor authentication.", {
        code: "cannot_reset_own_two_factor",
      }),
    );
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: copy.RESET_BUTTON }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: copy.RESET_CONFIRM_BUTTON }));
    expect(await screen.findByText(copy.RESET_OWN_ACCOUNT)).not.toBeNull();
    expect((screen.getByRole("button", { name: copy.RESET_BUTTON }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("any other failure stays in the dialog with a plain message", async () => {
    vi.mocked(resetAdminTwoFactor).mockRejectedValue(new AdminApiError(500, "boom", {}));
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: copy.RESET_BUTTON }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: copy.RESET_CONFIRM_BUTTON }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe(copy.RESET_FAILED);
    await waitFor(() => expect(screen.getByRole("dialog")).not.toBeNull());
  });

  it("your own record is shown disabled with the own-account message, from the signed-in token", () => {
    seedAdminSession(tokenFor("admin-me"));
    renderCard("admin-me");
    expect(screen.getByText(copy.RESET_OWN_ACCOUNT)).not.toBeNull();
    expect((screen.getByRole("button", { name: copy.RESET_BUTTON }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
