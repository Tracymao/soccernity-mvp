// B-282: the "Guardian notices" section on the Admin user detail page (Decision Log #458; backend B-280).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { AdminApiError } from "../../api/adminClient";

vi.mock("../../api/adminUsers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/adminUsers")>();
  return { ...actual, getUserSummary: vi.fn() };
});

vi.mock("../../api/adminGuardianNotices", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/adminGuardianNotices")>();
  return {
    ...actual,
    getGuardianNotices: vi.fn(),
    withholdGuardianNotices: vi.fn(),
    clearGuardianNotices: vi.fn(),
    reviewGuardianNotices: vi.fn(),
  };
});

// The page reads the admin through this hook; the tests drive it directly.
const authState: {
  value: null | {
    admin: { childSafetyVetted?: boolean } | null;
    refreshProfile: () => Promise<unknown>;
  };
} = { value: null };

vi.mock("../../auth/AdminAuthContext", () => ({
  useOptionalAdminAuth: () => authState.value,
}));

import { getUserSummary, type AdminUserSummary } from "../../api/adminUsers";
import {
  clearGuardianNotices,
  getGuardianNotices,
  reviewGuardianNotices,
  withholdGuardianNotices,
  type GuardianNoticesWithheld,
} from "../../api/adminGuardianNotices";
import UserDetailPage from "./UserDetailPage";

const REASON = "Safeguarding concern about the home. Staff are supporting the child directly.";

function summary(overrides: Partial<AdminUserSummary> = {}): AdminUserSummary {
  return {
    id: "user-1",
    email: "tolu.adeyemi@example.com",
    displayName: "Tolu Adeyemi",
    username: "tolu_a",
    role: "fan",
    accountStatus: "active",
    verificationStatus: "verified",
    isMinor: true,
    isUnder16: true,
    createdAt: "2026-09-14T10:00:00.000Z",
    pendingDeletionAt: null,
    safeguardingCountry: { declared: "GB", derived: "GB", method: "geoip", derivedAt: null },
    guardian: {
      name: "Sarah Adeyemi",
      email: "sarah@example.com",
      relationship: "Parent",
      consentStatus: "confirmed",
      consentDeclineSource: null,
      consentTimestamp: null,
      consentTokenExpiresAt: "2026-10-01T00:00:00.000Z",
      incorrectDetailsReportedAt: null,
      cardVerificationRequired: false,
      cardVerifiedAt: null,
      consentVerificationMethod: null,
    },
    usernameRevocations: [],
    ...overrides,
  };
}

function withheld(overrides: Partial<GuardianNoticesWithheld> = {}): GuardianNoticesWithheld {
  return {
    withheld: true,
    setAt: "2026-09-24T09:00:00.000Z",
    setBy: { id: "admin-9", displayName: "Amara Okafor" },
    reason: REASON,
    lastReviewedAt: null,
    lastReviewNote: null,
    reviewDueAt: "2026-10-24T09:00:00.000Z",
    reviewDue: false,
    ...overrides,
  };
}

function err(status: number, code: string | null, message = "Server message") {
  return new AdminApiError(status, message, code ? { code, message } : { message });
}

const profileCalls = vi.fn();

function setAdmin(vetted: boolean | undefined) {
  profileCalls.mockReset();
  profileCalls.mockResolvedValue(null);
  authState.value = {
    admin: vetted === undefined ? {} : { childSafetyVetted: vetted },
    refreshProfile: profileCalls,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/users/user-1"]}>
      <Routes>
        <Route path="/users/:id" element={<UserDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openPage() {
  renderPage();
  await screen.findByRole("heading", { name: "Tolu Adeyemi" });
}

beforeEach(() => {
  vi.mocked(getUserSummary).mockReset().mockResolvedValue(summary());
  vi.mocked(getGuardianNotices).mockReset();
  vi.mocked(withholdGuardianNotices).mockReset();
  vi.mocked(clearGuardianNotices).mockReset();
  vi.mocked(reviewGuardianNotices).mockReset();
  setAdmin(true);
});
afterEach(() => {
  cleanup();
  authState.value = null;
});

function notices() {
  return screen.findByRole("region", { name: "Guardian notices" });
}

describe("visibility: the section exists only for a vetted admin on a minor's live account", () => {
  it("is shown to a vetted admin on a minor (frame 1) with the two Account facts", async () => {
    vi.mocked(getGuardianNotices).mockResolvedValue({ withheld: false });
    await openPage();
    const card = await notices();
    expect(getGuardianNotices).toHaveBeenCalledTimes(1);
    expect(getGuardianNotices).toHaveBeenCalledWith("user-1");
    expect(within(card).getByText("[COPY PENDING LEGAL REVIEW]")).not.toBeNull();
    await within(card).findByText("Sending normally");
    expect(within(card).getByText(/Only child-safety-vetted staff can see this section/)).not.toBeNull();
    expect(within(card).getByText("Guardian security and safety notices for this account are sent as normal.")).not.toBeNull();
    expect(within(card).getByRole("button", { name: "Withhold guardian notices" })).not.toBeNull();
    const account = screen.getByRole("region", { name: "Account" });
    expect(within(account).getByText("Under 18")).not.toBeNull();
    expect(within(account).getByText("Confirmed")).not.toBeNull();
  });

  it.each([
    ["an admin who is not vetted", () => setAdmin(false), {}],
    ["an admin whose profile does not say", () => setAdmin(undefined), {}],
    ["a screen mounted with no admin session", () => (authState.value = null), {}],
    ["an adult account", () => undefined, { isMinor: false, isUnder16: false }],
    ["an anonymised account", () => undefined, { accountStatus: "deleted" }],
  ])("shows nothing and makes no guardian-notices request for %s", async (_name, arrange, user) => {
    arrange();
    vi.mocked(getUserSummary).mockResolvedValue(summary(user as Partial<AdminUserSummary>));
    await openPage();
    // Let the profile re-read and any (wrongly) triggered request settle before asserting none was made.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(screen.queryByRole("region", { name: "Guardian notices" })).toBeNull();
    expect(screen.queryByText("[COPY PENDING LEGAL REVIEW]")).toBeNull();
    expect(getGuardianNotices).not.toHaveBeenCalled();
  });

  it("shows the Age group and Guardian facts to every admin, an adult as 18 or over", async () => {
    setAdmin(false);
    vi.mocked(getUserSummary).mockResolvedValue(summary({ isMinor: false, guardian: null }));
    await openPage();
    const account = screen.getByRole("region", { name: "Account" });
    expect(within(account).getByText("18 or over")).not.toBeNull();
    expect(within(account).getByText("None confirmed")).not.toBeNull();
  });

  it("re-reads the admin's own profile when the screen opens and waits for it before asking for anything", async () => {
    let finish: (v: unknown) => void = () => undefined;
    profileCalls.mockReset().mockReturnValue(new Promise((resolve) => (finish = resolve)));
    vi.mocked(getGuardianNotices).mockResolvedValue({ withheld: false });
    await openPage();
    expect(profileCalls).toHaveBeenCalledTimes(1);
    expect(getGuardianNotices).not.toHaveBeenCalled();
    await act(async () => finish(null));
    await notices();
    expect(getGuardianNotices).toHaveBeenCalledTimes(1);
  });

  it("hides the section when the refreshed profile says the admin is no longer vetted", async () => {
    profileCalls.mockReset().mockImplementation(async () => {
      authState.value = { admin: { childSafetyVetted: false }, refreshProfile: profileCalls };
      return null;
    });
    await openPage();
    await waitFor(() => expect(profileCalls).toHaveBeenCalled());
    expect(getGuardianNotices).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Guardian notices" })).toBeNull();
  });
});

describe("states", () => {
  it("frame 9: a minor with no confirmed guardian gets the hint and the pill, and can still switch it on", async () => {
    vi.mocked(getUserSummary).mockResolvedValue(summary({ guardian: null }));
    vi.mocked(getGuardianNotices).mockResolvedValue({ withheld: false });
    await openPage();
    const card = await notices();
    await within(card).findByText("No guardian to notify");
    expect(within(card).getByText(/has no confirmed guardian yet, so withholding has no effect/)).not.toBeNull();
    expect(within(card).queryByText(/are sent as normal\.$/)).toBeNull();
    expect(within(card).getByRole("button", { name: "Withhold guardian notices" })).not.toBeNull();
    expect(within(screen.getByRole("region", { name: "Account" })).getByText("None confirmed")).not.toBeNull();
  });

  it("frame 4: ON shows who, when, the reason, and Record review / Clear, with no review-due marker", async () => {
    vi.mocked(getGuardianNotices).mockResolvedValue(withheld());
    await openPage();
    const card = await notices();
    await within(card).findByText("Withholding");
    expect(within(card).queryByText("Review due")).toBeNull();
    expect(within(card).getByText("Guardian notices are being withheld")).not.toBeNull();
    expect(within(card).getByText("Amara Okafor")).not.toBeNull();
    expect(within(card).getByText(/^24 Sep 2026/)).not.toBeNull();
    expect(within(card).getByText("Never")).not.toBeNull();
    expect(within(card).getByText("Reason (visible to child-safety-vetted admins only)")).not.toBeNull();
    expect(within(card).getByText(REASON)).not.toBeNull();
    expect(within(card).getByRole("button", { name: "Record review" })).not.toBeNull();
    expect(within(card).getByRole("button", { name: "Clear" })).not.toBeNull();
    expect(within(card).queryByText(/Only child-safety-vetted staff can see this section/)).toBeNull();
  });

  it("frame 5: the Review due pill and note come from the API's reviewDue, not from any date arithmetic here", async () => {
    // setAt is days ago but the server says not due; the browser must not second-guess it.
    vi.mocked(getGuardianNotices).mockResolvedValue(withheld({ reviewDue: false, setAt: "2020-01-01T00:00:00.000Z" }));
    await openPage();
    const quiet = await notices();
    await within(quiet).findByText("Withholding");
    expect(within(quiet).queryByText("Review due")).toBeNull();
    cleanup();

    vi.mocked(getGuardianNotices).mockResolvedValue(withheld({ reviewDue: true, setAt: new Date().toISOString() }));
    await openPage();
    const due = await notices();
    await within(due).findByText("Review due");
    expect(within(due).getByText(/This has been on for more than 30 days/)).not.toBeNull();
  });

  it("shows the date and the note of the latest review, and nothing like a history list", async () => {
    vi.mocked(getGuardianNotices).mockResolvedValue(
      withheld({ lastReviewedAt: "2026-10-20T09:00:00.000Z", lastReviewNote: "Still supporting the child." }),
    );
    await openPage();
    const card = await notices();
    await within(card).findByText("20 Oct 2026");
    expect(within(card).getByText("Still supporting the child.")).not.toBeNull();
    expect(within(card).queryByText("Never")).toBeNull();
    expect(within(card).queryByRole("list")).toBeNull();
  });
});

describe("set dialog (frames 2 and 3)", () => {
  async function openSetDialog() {
    vi.mocked(getGuardianNotices).mockResolvedValue({ withheld: false });
    await openPage();
    const card = await notices();
    fireEvent.click(await within(card).findByRole("button", { name: "Withhold guardian notices" }));
    return screen.getByRole("dialog", { name: "Withhold guardian notices?" });
  }

  it("shows the three bullets and the audit line, tagged", async () => {
    const dialog = await openSetDialog();
    expect(within(dialog).getByText("Tolu Adeyemi is under 18 and has a confirmed guardian. While this is on:")).not.toBeNull();
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(3);
    expect(within(dialog).getByText(/not affected\. \[COPY PENDING LEGAL REVIEW\]$/)).not.toBeNull();
    expect(within(dialog).getByText("The reason is saved to the audit record. [COPY PENDING LEGAL REVIEW]")).not.toBeNull();
  });

  it("frame 3: an empty (or blank) reason is refused on the page and nothing is sent", async () => {
    const dialog = await openSetDialog();
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "    " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Withhold notices" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe("A reason is required.");
    expect(withholdGuardianNotices).not.toHaveBeenCalled();
  });

  it("sends the trimmed reason and shows the ON card, with no success banner", async () => {
    vi.mocked(withholdGuardianNotices).mockResolvedValue(withheld());
    const dialog = await openSetDialog();
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: `  ${REASON}  ` } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Withhold notices" }));
    await waitFor(() => expect(withholdGuardianNotices).toHaveBeenCalledWith("user-1", REASON));
    await within(await notices()).findByText("Withholding");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("uses the no-guardian intro for an account with no confirmed guardian", async () => {
    vi.mocked(getUserSummary).mockResolvedValue(summary({ guardian: null }));
    const dialog = await openSetDialog();
    expect(within(dialog).getByText(/is under 18 and has no confirmed guardian yet\. While this is on:/)).not.toBeNull();
  });

  it("closing clears the field: reopening starts empty, and Escape closes", async () => {
    const dialog = await openSetDialog();
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: REASON } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(within(await notices()).getByRole("button", { name: "Withhold guardian notices" }));
    const again = screen.getByRole("dialog", { name: "Withhold guardian notices?" });
    expect((within(again).getByLabelText("Reason (required)") as HTMLTextAreaElement).value).toBe("");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows a plain tagged line when the server refuses the length (400) and keeps the dialog open", async () => {
    vi.mocked(withholdGuardianNotices).mockRejectedValue(err(400, "guardian_notices_text_invalid"));
    const dialog = await openSetDialog();
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "too short" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Withhold notices" }));
    expect(
      (await within(dialog).findByText("Enter between 10 and 1000 characters. [COPY PENDING LEGAL REVIEW]")).textContent,
    ).toContain("10 and 1000");
    expect(screen.getByRole("dialog", { name: "Withhold guardian notices?" })).not.toBeNull();
  });

  it("shows a fallback line for an unexpected failure, never the message text", async () => {
    vi.mocked(withholdGuardianNotices).mockRejectedValue(err(500, null, "boom with a secret reason inside"));
    const dialog = await openSetDialog();
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: REASON } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Withhold notices" }));
    expect(await within(dialog).findByText("Couldn’t save that. Nothing was changed. Try again.")).not.toBeNull();
    expect(screen.queryByText(/secret reason/)).toBeNull();
  });
});

describe("record review dialog (frame 6)", () => {
  it("needs a note, then records it and shows the latest review", async () => {
    vi.mocked(getGuardianNotices).mockResolvedValue(withheld({ reviewDue: true }));
    vi.mocked(reviewGuardianNotices).mockResolvedValue(
      withheld({ lastReviewedAt: "2026-10-30T09:00:00.000Z", lastReviewNote: "Continue.", reviewDue: false }),
    );
    await openPage();
    fireEvent.click(await within(await notices()).findByRole("button", { name: "Record review" }));
    const dialog = screen.getByRole("dialog", { name: "Record a review" });
    expect(
      within(dialog).getByText(
        "Confirm that withholding guardian notices for Tolu Adeyemi should continue. Your note is saved to the audit record. [COPY PENDING LEGAL REVIEW]",
      ),
    ).not.toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Record review" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe("A note is required.");
    expect(reviewGuardianNotices).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText("Note (required)"), { target: { value: "  Continue.  " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record review" }));
    await waitFor(() => expect(reviewGuardianNotices).toHaveBeenCalledWith("user-1", "Continue."));
    const card = await notices();
    await within(card).findByText("30 Oct 2026");
    expect(within(card).queryByText("Review due")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("clear dialog and banner (frames 7 and 8)", () => {
  it("clears with a reason, shows the Info banner and returns the section to OFF", async () => {
    vi.mocked(getGuardianNotices).mockResolvedValue(withheld());
    vi.mocked(clearGuardianNotices).mockResolvedValue({ withheld: false });
    await openPage();
    fireEvent.click(await within(await notices()).findByRole("button", { name: "Clear" }));
    const dialog = screen.getByRole("dialog", { name: "Clear guardian-notice withholding?" });
    expect(
      within(dialog).getByText(
        "Guardian notices for Tolu Adeyemi will be sent as normal from now on. Notices that were skipped while this was on will not be sent. [COPY PENDING LEGAL REVIEW]",
      ),
    ).not.toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Clear" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe("A reason is required.");
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "The concern has ended." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(clearGuardianNotices).toHaveBeenCalledWith("user-1", "The concern has ended."));
    const banner = await screen.findByRole("status");
    expect(within(banner).getByText("Guardian notices cleared")).not.toBeNull();
    expect(
      within(banner).getByText(
        "Guardian notices for Tolu Adeyemi are sent as normal again. Notices skipped while this was on will not be sent. The action was recorded. [COPY PENDING LEGAL REVIEW]",
      ),
    ).not.toBeNull();
    const card = await notices();
    await within(card).findByText("Sending normally");
    expect(within(card).getByRole("button", { name: "Withhold guardian notices" })).not.toBeNull();
  });
});

describe("conflicts and refusals", () => {
  async function openClear() {
    // First read: withheld. Any later read (after a conflict): not withheld.
    vi.mocked(getGuardianNotices).mockResolvedValueOnce(withheld()).mockResolvedValue({ withheld: false });
    await openPage();
    fireEvent.click(await within(await notices()).findByRole("button", { name: "Clear" }));
    const dialog = screen.getByRole("dialog", { name: "Clear guardian-notice withholding?" });
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "The concern has ended." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Clear" }));
  }

  it("409 not_withheld (a stale page): shows the current state and says it had changed", async () => {
    vi.mocked(clearGuardianNotices).mockRejectedValue(err(409, "guardian_notices_not_withheld"));
    await openClear();
    await within(await notices()).findByText("Sending normally");
    expect(screen.getByText(/Another admin changed guardian notices for this account/)).not.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(getGuardianNotices).toHaveBeenCalledTimes(2);
  });

  it("409 already_withheld (a stale page): refetches and shows the withheld state", async () => {
    vi.mocked(getGuardianNotices).mockResolvedValue({ withheld: false });
    vi.mocked(withholdGuardianNotices).mockRejectedValue(err(409, "guardian_notices_already_withheld"));
    await openPage();
    fireEvent.click(await within(await notices()).findByRole("button", { name: "Withhold guardian notices" }));
    const dialog = screen.getByRole("dialog", { name: "Withhold guardian notices?" });
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: REASON } });
    vi.mocked(getGuardianNotices).mockResolvedValue(withheld());
    fireEvent.click(within(dialog).getByRole("button", { name: "Withhold notices" }));
    await within(await notices()).findByText("Withholding");
    expect(screen.getByText(/Another admin changed guardian notices/)).not.toBeNull();
  });

  it("409 not_applicable on an action removes the section", async () => {
    vi.mocked(clearGuardianNotices).mockRejectedValue(err(409, "guardian_notices_not_applicable"));
    await openClear();
    await waitFor(() => expect(screen.queryByRole("region", { name: "Guardian notices" })).toBeNull());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("409 not_applicable on the load removes the section", async () => {
    vi.mocked(getGuardianNotices).mockRejectedValue(err(409, "guardian_notices_not_applicable"));
    await openPage();
    await waitFor(() => expect(getGuardianNotices).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("region", { name: "Guardian notices" })).toBeNull());
  });

  it("404 on the load shows the page's error pattern with Retry", async () => {
    vi.mocked(getGuardianNotices).mockRejectedValueOnce(err(404, null, "User not found"));
    await openPage();
    const card = await notices();
    expect((await within(card).findByRole("alert")).textContent).toContain("User not found");
    vi.mocked(getGuardianNotices).mockResolvedValue({ withheld: false });
    fireEvent.click(within(card).getByRole("button", { name: "Retry" }));
    await within(card).findByText("Sending normally");
  });

  it("a load failure that is not a 404 says so in plain words", async () => {
    vi.mocked(getGuardianNotices).mockRejectedValue(err(500, null, "stack trace"));
    await openPage();
    const card = await notices();
    expect((await within(card).findByRole("alert")).textContent).toContain("Couldn’t load the guardian notices");
    expect(within(card).queryByText(/stack trace/)).toBeNull();
  });

  it("frame 10: the vetting 403 on an action shows the restricted dialog and re-reads the profile", async () => {
    vi.mocked(getGuardianNotices).mockResolvedValue({ withheld: false });
    vi.mocked(withholdGuardianNotices).mockRejectedValue(err(403, "child_safety_vetting_required"));
    await openPage();
    fireEvent.click(await within(await notices()).findByRole("button", { name: "Withhold guardian notices" }));
    const dialog = screen.getByRole("dialog", { name: "Withhold guardian notices?" });
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: REASON } });
    expect(profileCalls).toHaveBeenCalledTimes(1);
    // The refetch will say "not vetted any more".
    profileCalls.mockImplementation(async () => {
      authState.value = { admin: { childSafetyVetted: false }, refreshProfile: profileCalls };
      return null;
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Withhold notices" }));
    const restricted = await screen.findByRole("dialog", { name: "Withhold guardian notices" });
    expect(within(restricted).getByText("Restricted — child-safety vetting required")).not.toBeNull();
    await waitFor(() => expect(profileCalls).toHaveBeenCalledTimes(2));
    // The stale section goes away; the restricted dialog stays until Close.
    await waitFor(() => expect(screen.queryByRole("region", { name: "Guardian notices" })).toBeNull());
    fireEvent.click(within(restricted).getAllByRole("button", { name: "Close" })[1]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the vetting 403 on the load shows the restricted dialog too", async () => {
    vi.mocked(getGuardianNotices).mockRejectedValue(err(403, "child_safety_vetting_required"));
    await openPage();
    const restricted = await screen.findByRole("dialog", { name: "Guardian notices" });
    expect(within(restricted).getByText("Restricted — child-safety vetting required")).not.toBeNull();
    await waitFor(() => expect(profileCalls).toHaveBeenCalledTimes(2));
  });

  it("a review or clear refused with the vetting 403 reports its own dialog title", async () => {
    vi.mocked(getGuardianNotices).mockResolvedValue(withheld());
    vi.mocked(reviewGuardianNotices).mockRejectedValue(err(403, "child_safety_vetting_required"));
    await openPage();
    fireEvent.click(await within(await notices()).findByRole("button", { name: "Record review" }));
    const dialog = screen.getByRole("dialog", { name: "Record a review" });
    fireEvent.change(within(dialog).getByLabelText("Note (required)"), { target: { value: "Continue." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record review" }));
    expect(await screen.findByRole("dialog", { name: "Record a review" })).not.toBeNull();
    expect(await screen.findByText("Restricted — child-safety vetting required")).not.toBeNull();
  });
});

describe("privacy", () => {
  it("never puts the reason in the URL, storage, the title or the console", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    vi.mocked(getGuardianNotices).mockResolvedValue({ withheld: false });
    vi.mocked(withholdGuardianNotices).mockResolvedValue(withheld());
    await openPage();
    fireEvent.click(await within(await notices()).findByRole("button", { name: "Withhold guardian notices" }));
    const dialog = screen.getByRole("dialog", { name: "Withhold guardian notices?" });
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: REASON } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Withhold notices" }));
    await within(await notices()).findByText("Withholding");
    expect(window.location.href).not.toContain("Safeguarding");
    expect(document.title).not.toContain("Safeguarding");
    expect(JSON.stringify({ ...window.localStorage })).not.toContain("Safeguarding");
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain("Safeguarding");
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });
});
