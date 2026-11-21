// R103: the Bants, Community Groups, messaging and password-reset screens classify a refused write by the
// server's `code`, never by its message text.
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import BanterJoinButton from "../banter/BanterJoinButton";
import GroupJoinButton from "../community-groups/GroupJoinButton";
import ForgotPasswordPage from "../ForgotPasswordPage";
import ResetPasswordPage from "../ResetPasswordPage";
import { isAwaitingConsent as groupsAwaiting } from "../community-groups/errors";
import { isAwaitingConsent as grassrootsAwaiting } from "../grassroots/errors";
import { BanterApiError, joinRoom } from "../../api/banter";
import { CommunityGroupsApiError, joinCommunityGroup } from "../../api/community-groups";
import { GrassrootsApiError } from "../../api/grassroots";
import { ApiError } from "../../lib/apiClient";
import { forgotPassword, resetPassword } from "../../lib/authApi";

vi.mock("../../api/banter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/banter")>();
  return { ...actual, joinRoom: vi.fn(), leaveRoom: vi.fn() };
});
vi.mock("../../api/community-groups", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/community-groups")>();
  return { ...actual, joinCommunityGroup: vi.fn(), leaveCommunityGroup: vi.fn() };
});
vi.mock("../../lib/authApi", () => ({ forgotPassword: vi.fn(), resetPassword: vi.fn() }));

afterEach(cleanup);

const CASES: Array<[string, RegExp, string | null]> = [
  ["guardian_consent_pending", /guardian consent/i, "/guardian-consent"],
  ["email_verification_required", /verify your email/i, "/verify-email/prompt"],
  ["profile_incomplete", /choose a username/i, "/create-profile"],
  ["under_16_restricted", /isn.t available for your account/i, null],
];

describe("guardian consent is matched by code, not message text", () => {
  it("community groups", () => {
    expect(groupsAwaiting(new CommunityGroupsApiError("needs guardian consent", { status: 403 }))).toBe(false);
    expect(
      groupsAwaiting(new CommunityGroupsApiError("needs guardian consent", { status: 403, code: "other_code" })),
    ).toBe(false);
    expect(groupsAwaiting(new CommunityGroupsApiError("x", { status: 403, code: "guardian_consent_pending" }))).toBe(true);
  });
  it("grassroots", () => {
    expect(grassrootsAwaiting(new GrassrootsApiError("needs guardian consent", { status: 403, code: "x" }))).toBe(false);
    expect(grassrootsAwaiting(new GrassrootsApiError("x", { status: 403, code: "guardian_consent_pending" }))).toBe(true);
  });
});

describe.each(CASES)("refused join (%s)", (code, text, href) => {
  it("Bants join shows the matching notice", async () => {
    vi.mocked(joinRoom).mockRejectedValueOnce(new BanterApiError("server text", { status: 403, code }));
    render(
      <MemoryRouter>
        <BanterJoinButton accessToken="t" roomId="r" joined={false} onToggled={() => {}} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByText(text)).not.toBeNull();
    if (href) expect(screen.getByRole("link").getAttribute("href")).toBe(href);
    expect(screen.queryByText("server text")).toBeNull();
  });
  it("Community Group join shows the matching notice", async () => {
    vi.mocked(joinCommunityGroup).mockRejectedValueOnce(new CommunityGroupsApiError("server text", { status: 403, code }));
    render(
      <MemoryRouter>
        <GroupJoinButton accessToken="t" groupId="g" joined={false} onToggled={() => {}} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("alert")).not.toBeNull());
    expect(screen.getByRole("alert").textContent).toMatch(text);
    if (href) expect(screen.getByRole("link").getAttribute("href")).toBe(href);
  });
});

describe("a specific server 403 is still shown as written", () => {
  it("Bants: non-guardian 403 keeps the server text", async () => {
    vi.mocked(joinRoom).mockRejectedValueOnce(new BanterApiError("You blocked this person", { status: 403, code: "you_blocked" }));
    render(
      <MemoryRouter>
        <BanterJoinButton accessToken="t" roomId="r" joined={false} onToggled={() => {}} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByText("You blocked this person")).not.toBeNull();
  });
});

describe("429 on password routes", () => {
  it("forgot password", async () => {
    vi.mocked(forgotPassword).mockRejectedValueOnce(new ApiError(429, "Too Many"));
    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@b.co" } });
    fireEvent.submit(screen.getByLabelText(/email/i).closest("form")!);
    expect(await screen.findByText("Too many requests. Please wait a little while and try again.")).not.toBeNull();
  });
  it("forgot password keeps the generic line for other failures", async () => {
    vi.mocked(forgotPassword).mockRejectedValueOnce(new ApiError(500, "boom"));
    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@b.co" } });
    fireEvent.submit(screen.getByLabelText(/email/i).closest("form")!);
    expect(await screen.findByText(/something went wrong/i)).not.toBeNull();
  });
  it("reset password", async () => {
    vi.mocked(resetPassword).mockRejectedValueOnce(new ApiError(429, "Too Many"));
    render(
      <MemoryRouter initialEntries={["/reset-password?token=abc"]}>
        <ResetPasswordPage />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "longenough1" } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "longenough1" } });
    fireEvent.submit(screen.getByLabelText(/confirm password/i).closest("form")!);
    expect(await screen.findByText("Too many requests. Please wait a little while and try again.")).not.toBeNull();
  });
});
