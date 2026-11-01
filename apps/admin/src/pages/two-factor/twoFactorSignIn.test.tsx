import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import TwoFactorSignIn from "./TwoFactorSignIn";
import * as copy from "./twoFactorCopy";

vi.mock("../../api/adminTwoFactor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/adminTwoFactor")>();
  return {
    ...actual,
    completeTwoFactorLogin: vi.fn(),
    startEnrolmentAtSignIn: vi.fn(),
    confirmEnrolmentAtSignIn: vi.fn(),
  };
});
import {
  AdminTwoFactorError,
  INVALID_CODE_MESSAGE,
  completeTwoFactorLogin,
  confirmEnrolmentAtSignIn,
  startEnrolmentAtSignIn,
} from "../../api/adminTwoFactor";

const SESSION = {
  accessToken: "access-1",
  accessTokenExpiresIn: 900,
  refreshTokenExpiresAt: "2026-12-01T00:00:00.000Z",
  admin: {
    id: "admin-1",
    email: "ada@soccernity.com",
    fullName: "Ada Lovelace",
    phone: null,
    role: "superadmin",
    accountStatus: "active",
    createdAt: "",
    updatedAt: "",
  },
};
const CODES = ["ABCDE23456", "FGHJK23456", "LMNPQ23456", "RSTUV23456", "WXYZA23456", "BCDEF23456", "GHJKL23456", "MNPQR23456", "STUVW23456", "XYZAB23456"];

const onBack = vi.fn();
const onSignedIn = vi.fn();

function type(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  vi.mocked(completeTwoFactorLogin).mockReset();
  vi.mocked(startEnrolmentAtSignIn).mockReset();
  vi.mocked(confirmEnrolmentAtSignIn).mockReset();
  onBack.mockReset();
  onSignedIn.mockReset();
});
afterEach(cleanup);

describe("sign-in code prompt (login answered twoFactorRequired)", () => {
  function renderPrompt() {
    return render(
      <TwoFactorSignIn step={{ kind: "challenge", challengeToken: "chal-1" }} onBack={onBack} onSignedIn={onSignedIn} />,
    );
  }

  it("shows the prompt with Sign in disabled until six digits are typed, and keeps digits only", () => {
    renderPrompt();
    expect(screen.getByRole("heading", { name: copy.PROMPT_TITLE })).not.toBeNull();
    expect(screen.getByText(copy.PROMPT_HELP)).not.toBeNull();
    const submit = screen.getByRole("button", { name: copy.SIGN_IN }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    type("Authentication code", "12ab34");
    expect((screen.getByLabelText("Authentication code") as HTMLInputElement).value).toBe("1234");
    expect(submit.disabled).toBe(true);
    type("Authentication code", "123456");
    expect(submit.disabled).toBe(false);
  });

  it("sends the challenge token and code, then hands the session to the page", async () => {
    vi.mocked(completeTwoFactorLogin).mockResolvedValue(SESSION);
    renderPrompt();
    type("Authentication code", "123456");
    fireEvent.click(screen.getByRole("button", { name: copy.SIGN_IN }));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(SESSION));
    expect(completeTwoFactorLogin).toHaveBeenCalledWith("chal-1", "123456");
  });

  it("a wrong or used code shows the API message, clears the field and keeps the screen", async () => {
    vi.mocked(completeTwoFactorLogin).mockRejectedValue(new AdminTwoFactorError(401, INVALID_CODE_MESSAGE));
    renderPrompt();
    type("Authentication code", "123456");
    fireEvent.click(screen.getByRole("button", { name: copy.SIGN_IN }));
    expect((await screen.findByRole("alert")).textContent).toBe(INVALID_CODE_MESSAGE);
    expect((screen.getByLabelText("Authentication code") as HTMLInputElement).value).toBe("");
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it.each([
    ["the per-account lock (429 with its code)", new AdminTwoFactorError(429, "Too many attempts. Try again later.", "two_factor_code_locked")],
    ["the per-IP limit (429 with no code)", new AdminTwoFactorError(429, "ThrottlerException: Too Many Requests")],
  ])("%s shows the locked wording and disables entry", async (_name, error) => {
    vi.mocked(completeTwoFactorLogin).mockRejectedValue(error);
    renderPrompt();
    type("Authentication code", "123456");
    fireEvent.click(screen.getByRole("button", { name: copy.SIGN_IN }));
    expect(await screen.findByText(copy.LOCKED_TITLE)).not.toBeNull();
    expect(screen.getByText(copy.LOCKED_BODY)).not.toBeNull();
    expect((screen.getByLabelText("Authentication code") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: copy.SIGN_IN }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("an expired sign-in step offers only Back to sign in", async () => {
    vi.mocked(completeTwoFactorLogin).mockRejectedValue(
      new AdminTwoFactorError(401, "This sign-in step has expired. Sign in again."),
    );
    renderPrompt();
    type("Authentication code", "123456");
    fireEvent.click(screen.getByRole("button", { name: copy.SIGN_IN }));
    expect(await screen.findByRole("heading", { name: copy.PROMPT_EXPIRED_TITLE })).not.toBeNull();
    expect(screen.getByText(copy.PROMPT_EXPIRED_BODY)).not.toBeNull();
    expect(screen.queryByLabelText("Authentication code")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: copy.BACK_TO_SIGN_IN }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("a network or server failure shows a generic error, not the wrong-code message", async () => {
    vi.mocked(completeTwoFactorLogin).mockRejectedValue(new AdminTwoFactorError(500, "boom"));
    renderPrompt();
    type("Authentication code", "123456");
    fireEvent.click(screen.getByRole("button", { name: copy.SIGN_IN }));
    expect((await screen.findByRole("alert")).textContent).toBe(copy.GENERIC_ERROR);
  });

  it("switches to a backup code and back; a backup code needs 10 characters and is sent as typed", async () => {
    vi.mocked(completeTwoFactorLogin).mockResolvedValue(SESSION);
    renderPrompt();
    fireEvent.click(screen.getByRole("button", { name: copy.USE_BACKUP_CODE }));
    expect(screen.getByRole("heading", { name: copy.BACKUP_PROMPT_TITLE })).not.toBeNull();
    expect(screen.getByText(copy.BACKUP_PROMPT_HELP)).not.toBeNull();
    const submit = screen.getByRole("button", { name: copy.SIGN_IN }) as HTMLButtonElement;
    type(copy.BACKUP_CODE_LABEL, "ABCDE-2345");
    expect(submit.disabled).toBe(true); // 9 characters once the hyphen is ignored
    type(copy.BACKUP_CODE_LABEL, "ABCDE-23456");
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(SESSION));
    expect(completeTwoFactorLogin).toHaveBeenCalledWith("chal-1", "ABCDE-23456");
  });

  it("a backup code that does not work shows the same message; Use an authenticator code returns", async () => {
    vi.mocked(completeTwoFactorLogin).mockRejectedValue(new AdminTwoFactorError(401, INVALID_CODE_MESSAGE));
    renderPrompt();
    fireEvent.click(screen.getByRole("button", { name: copy.USE_BACKUP_CODE }));
    type(copy.BACKUP_CODE_LABEL, "ABCDE23456");
    fireEvent.click(screen.getByRole("button", { name: copy.SIGN_IN }));
    expect((await screen.findByRole("alert")).textContent).toBe(INVALID_CODE_MESSAGE);
    fireEvent.click(screen.getByRole("button", { name: copy.USE_AUTHENTICATOR_CODE }));
    expect(screen.getByRole("heading", { name: copy.PROMPT_TITLE })).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("Back to sign in goes back; the token is never written to browser storage", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    renderPrompt();
    fireEvent.click(screen.getByRole("button", { name: copy.BACK_TO_SIGN_IN }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});

describe("enrolment at sign-in (login answered twoFactorEnrolmentRequired)", () => {
  const START = { secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", otpauthUri: "otpauth://totp/Soccernity:ada?secret=JBSWY3DPEHPK3PXP&issuer=Soccernity" };

  function renderEnrol(strict = false) {
    const tree = (
      <TwoFactorSignIn step={{ kind: "enrolment", enrolmentToken: "enrol-1" }} onBack={onBack} onSignedIn={onSignedIn} />
    );
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  }

  it("starts the setup once (even under StrictMode), shows a loading state, then the QR code", async () => {
    let resolve: (v: typeof START) => void = () => {};
    vi.mocked(startEnrolmentAtSignIn).mockReturnValue(new Promise((r) => (resolve = r)));
    const { container } = renderEnrol(true);
    expect(screen.getByText(copy.ENROL_PREPARING)).not.toBeNull();
    expect((screen.getByRole("button", { name: copy.CONTINUE }) as HTMLButtonElement).disabled).toBe(true);
    resolve(START);
    await waitFor(() => expect(container.querySelector("svg")).not.toBeNull());
    expect(startEnrolmentAtSignIn).toHaveBeenCalledTimes(1);
    expect(startEnrolmentAtSignIn).toHaveBeenCalledWith("enrol-1");
    expect(screen.getByRole("heading", { name: copy.ENROL_TITLE })).not.toBeNull();
    expect(screen.getByText(copy.ENROL_INTRO)).not.toBeNull();
    expect(screen.getByText(copy.STEP_1_OF_2)).not.toBeNull();
  });

  it("Can't scan shows the setup key in groups of four, and Back to the QR code returns", async () => {
    vi.mocked(startEnrolmentAtSignIn).mockResolvedValue(START);
    const { container } = renderEnrol();
    await waitFor(() => expect(container.querySelector("svg")).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: copy.CANT_SCAN }));
    expect(screen.getByRole("heading", { name: copy.KEY_TITLE })).not.toBeNull();
    expect(screen.getByText(copy.KEY_HELP)).not.toBeNull();
    expect(screen.getByLabelText("Setup key").textContent).toBe("JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP");
    fireEvent.click(screen.getByRole("button", { name: copy.BACK_TO_QR }));
    expect(screen.getByRole("heading", { name: copy.ENROL_TITLE })).not.toBeNull();
  });

  async function toCodeStep() {
    vi.mocked(startEnrolmentAtSignIn).mockResolvedValue(START);
    const view = renderEnrol();
    await waitFor(() => expect(view.container.querySelector("svg")).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: copy.CONTINUE }));
    return view;
  }

  it("step 2 asks for six digits; Back returns to step 1", async () => {
    await toCodeStep();
    expect(screen.getByText(copy.STEP_2_OF_2)).not.toBeNull();
    expect(screen.getByRole("heading", { name: copy.CODE_TITLE })).not.toBeNull();
    expect(screen.getByText(copy.CODE_HELP)).not.toBeNull();
    expect((screen.getByRole("button", { name: copy.CONFIRM }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: copy.BACK }));
    expect(screen.getByText(copy.STEP_1_OF_2)).not.toBeNull();
  });

  it("holds the session until the backup codes are saved: nothing is handed over before the box is ticked", async () => {
    vi.mocked(confirmEnrolmentAtSignIn).mockResolvedValue({ ...SESSION, backupCodes: CODES });
    await toCodeStep();
    type("Authentication code", "654321");
    fireEvent.click(screen.getByRole("button", { name: copy.CONFIRM }));
    expect(await screen.findByRole("heading", { name: copy.BACKUP_TITLE })).not.toBeNull();
    expect(confirmEnrolmentAtSignIn).toHaveBeenCalledWith("enrol-1", "654321");

    // ten codes, shown 5-5, and no session yet
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(screen.getByText("ABCDE-23456")).not.toBeNull();
    expect(onSignedIn).not.toHaveBeenCalled();

    const cont = screen.getByRole("button", { name: copy.CONTINUE_TO_CONSOLE }) as HTMLButtonElement;
    expect(cont.disabled).toBe(true);
    fireEvent.click(cont);
    expect(onSignedIn).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(copy.SAVED_CODES_LABEL));
    expect(cont.disabled).toBe(false);
    fireEvent.click(cont);
    // the session, without the backup codes
    expect(onSignedIn).toHaveBeenCalledWith(SESSION);
  });

  it("Copy codes writes the ten codes to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    vi.mocked(confirmEnrolmentAtSignIn).mockResolvedValue({ ...SESSION, backupCodes: CODES });
    await toCodeStep();
    type("Authentication code", "654321");
    fireEvent.click(screen.getByRole("button", { name: copy.CONFIRM }));
    await screen.findByRole("heading", { name: copy.BACKUP_TITLE });
    fireEvent.click(screen.getByRole("button", { name: copy.COPY_CODES }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toContain("ABCDE-23456\nFGHJK-23456");
    vi.unstubAllGlobals();
  });

  it("a wrong first code shows the API message and clears the field", async () => {
    vi.mocked(confirmEnrolmentAtSignIn).mockRejectedValue(new AdminTwoFactorError(401, INVALID_CODE_MESSAGE));
    await toCodeStep();
    type("Authentication code", "000000");
    fireEvent.click(screen.getByRole("button", { name: copy.CONFIRM }));
    expect((await screen.findByRole("alert")).textContent).toBe(INVALID_CODE_MESSAGE);
    expect((screen.getByLabelText("Authentication code") as HTMLInputElement).value).toBe("");
  });

  it("five wrong codes (429) lock entry with the drawn wording", async () => {
    vi.mocked(confirmEnrolmentAtSignIn).mockRejectedValue(
      new AdminTwoFactorError(429, "Too many attempts. Try again later.", "two_factor_code_locked"),
    );
    await toCodeStep();
    type("Authentication code", "000000");
    fireEvent.click(screen.getByRole("button", { name: copy.CONFIRM }));
    expect(await screen.findByText(copy.LOCKED_TITLE)).not.toBeNull();
    expect(screen.getByText(copy.LOCKED_BODY)).not.toBeNull();
    expect((screen.getByRole("button", { name: copy.CONFIRM }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("an expired enrolment token at confirm shows Setup expired with only Back to sign in", async () => {
    vi.mocked(confirmEnrolmentAtSignIn).mockRejectedValue(
      new AdminTwoFactorError(401, "This sign-in step has expired. Sign in again."),
    );
    await toCodeStep();
    type("Authentication code", "000000");
    fireEvent.click(screen.getByRole("button", { name: copy.CONFIRM }));
    expect(await screen.findByRole("heading", { name: copy.ENROL_EXPIRED_TITLE })).not.toBeNull();
    expect(screen.getByText(copy.ENROL_EXPIRED_BODY)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: copy.BACK_TO_SIGN_IN }));
    expect(onBack).toHaveBeenCalled();
  });

  it("the pending setup being gone (400 no pending enrolment) is also Setup expired", async () => {
    vi.mocked(confirmEnrolmentAtSignIn).mockRejectedValue(
      new AdminTwoFactorError(400, "Start enrolment first, or it has expired.", "two_factor_no_pending_enrolment"),
    );
    await toCodeStep();
    type("Authentication code", "000000");
    fireEvent.click(screen.getByRole("button", { name: copy.CONFIRM }));
    expect(await screen.findByRole("heading", { name: copy.ENROL_EXPIRED_TITLE })).not.toBeNull();
  });

  it("an expired token when starting shows Setup expired", async () => {
    vi.mocked(startEnrolmentAtSignIn).mockRejectedValue(
      new AdminTwoFactorError(401, "This sign-in step has expired. Sign in again."),
    );
    renderEnrol();
    expect(await screen.findByRole("heading", { name: copy.ENROL_EXPIRED_TITLE })).not.toBeNull();
  });

  it("a locked or failed start shows a banner with Back to sign in", async () => {
    vi.mocked(startEnrolmentAtSignIn).mockRejectedValue(new AdminTwoFactorError(429, "Too Many Requests"));
    const first = renderEnrol();
    expect(await screen.findByText(copy.LOCKED_TITLE)).not.toBeNull();
    first.unmount();

    vi.mocked(startEnrolmentAtSignIn).mockRejectedValue(new AdminTwoFactorError(500, "boom"));
    render(
      <TwoFactorSignIn step={{ kind: "enrolment", enrolmentToken: "enrol-2" }} onBack={onBack} onSignedIn={onSignedIn} />,
    );
    expect((await screen.findByRole("alert")).textContent).toBe(copy.GENERIC_ERROR);
    expect(screen.getByRole("button", { name: copy.BACK_TO_SIGN_IN })).not.toBeNull();
  });

  it("never writes the enrolment token to browser storage", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    vi.mocked(startEnrolmentAtSignIn).mockResolvedValue(START);
    const { container } = renderEnrol();
    await waitFor(() => expect(container.querySelector("svg")).not.toBeNull());
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});
