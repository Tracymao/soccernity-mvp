// AccountInformationPage (/settings/account/information). Mocks api/users; the
// phone is the only writable field (UpdateUserDto), email and date of birth are read-only.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import AccountInformationPage, { DOB_NOTE, MESSAGES, formatDateOfBirth } from "./AccountInformationPage";

vi.mock("../../api/users", async () => {
  const actual = await vi.importActual<typeof import("../../api/users")>("../../api/users");
  return { ...actual, getUser: vi.fn(), updateUser: vi.fn() };
});

import { UsersApiError, getUser, updateUser, type UserProfile } from "../../api/users";
import { seedSession, clearSession } from "../../test/session";

function b64(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const TOKEN = `${b64({ alg: "none" })}.${b64({ sub: "me", role: "fan" })}.sig`;

function profile(over: Partial<UserProfile> = {}): UserProfile {
  return {
    id: "me",
    email: "adeniyi@example.com",
    phone: "+2348104020224",
    dateOfBirth: "1998-09-04",
    isMinor: false,
    ...over,
  } as UserProfile;
}

afterEach(cleanup);
beforeEach(() => {
  clearSession();
  vi.mocked(getUser).mockReset();
  vi.mocked(updateUser).mockReset();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/settings/account/information"]}>
      <AccountInformationPage />
    </MemoryRouter>,
  );
}

describe("formatDateOfBirth", () => {
  it("formats the frame's way", () => {
    expect(formatDateOfBirth("1998-09-04")).toBe("04 / 09 / 1998");
    expect(formatDateOfBirth("1998-09-04T00:00:00.000Z")).toBe("04 / 09 / 1998");
  });
  it("leaves an unrecognised value as it came", () => {
    expect(formatDateOfBirth("nope")).toBe("nope");
  });
});

describe("AccountInformationPage", () => {
  it("asks a signed-out visitor to log in and reads nothing", () => {
    renderPage();
    expect(screen.getByText(/log in to manage your account/i)).not.toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });

  describe("signed in", () => {
    beforeEach(() => seedSession(TOKEN));

    it("shows the phone, the read-only email and date of birth, the tagged note and the Edit Profile line", async () => {
      vi.mocked(getUser).mockResolvedValue(profile());
      renderPage();
      expect(await screen.findByDisplayValue("+2348104020224")).not.toBeNull();
      const email = screen.getByLabelText("Email") as HTMLInputElement;
      expect(email.value).toBe("adeniyi@example.com");
      expect(email.readOnly).toBe(true);
      const dob = screen.getByLabelText("Date of birth") as HTMLInputElement;
      expect(dob.value).toBe("04 / 09 / 1998");
      expect(dob.readOnly).toBe(true);
      expect(screen.getByText(DOB_NOTE)).not.toBeNull();
      expect(screen.getByText("Username and country are changed in Edit Profile.")).not.toBeNull();
      expect(screen.getByRole("link", { name: "Change email" }).getAttribute("href")).toBe(
        "/settings/account/information/change-email",
      );
    });

    it("shows a load error when the profile cannot be read", async () => {
      vi.mocked(getUser).mockRejectedValue(new Error("boom"));
      renderPage();
      expect(await screen.findByText(MESSAGES.loadFailed)).not.toBeNull();
    });

    it("keeps Save disabled until the phone changes, then sends the phone only", async () => {
      vi.mocked(getUser).mockResolvedValue(profile());
      vi.mocked(updateUser).mockResolvedValue(profile({ phone: "+2348100000000" }));
      renderPage();
      await screen.findByDisplayValue("+2348104020224");
      const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
      expect(save.disabled).toBe(true);
      fireEvent.change(screen.getByLabelText("Phone Number"), { target: { value: "+2348100000000" } });
      expect(save.disabled).toBe(false);
      fireEvent.click(save);
      await waitFor(() => expect(updateUser).toHaveBeenCalledWith(TOKEN, "me", { phone: "+2348100000000" }));
      expect(await screen.findByText(MESSAGES.phoneSaved)).not.toBeNull();
    });

    it("refuses a phone the server would refuse, without a request", async () => {
      vi.mocked(getUser).mockResolvedValue(profile());
      renderPage();
      await screen.findByDisplayValue("+2348104020224");
      fireEvent.change(screen.getByLabelText("Phone Number"), { target: { value: "12" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(await screen.findByText(MESSAGES.phoneInvalid)).not.toBeNull();
      expect(updateUser).not.toHaveBeenCalled();
    });

    it("says a restricted-pending minor cannot save, by code", async () => {
      vi.mocked(getUser).mockResolvedValue(profile());
      vi.mocked(updateUser).mockRejectedValue(
        new UsersApiError("x", { status: 403, code: "guardian_consent_pending" }),
      );
      renderPage();
      await screen.findByDisplayValue("+2348104020224");
      fireEvent.change(screen.getByLabelText("Phone Number"), { target: { value: "+2348100000000" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(await screen.findByText(MESSAGES.consentPending)).not.toBeNull();
    });

    it("shows a generic line for any other failure", async () => {
      vi.mocked(getUser).mockResolvedValue(profile());
      vi.mocked(updateUser).mockRejectedValue(new UsersApiError("x", { status: 500 }));
      renderPage();
      await screen.findByDisplayValue("+2348104020224");
      fireEvent.change(screen.getByLabelText("Phone Number"), { target: { value: "+2348100000000" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(await screen.findByText(MESSAGES.generic)).not.toBeNull();
    });

    it("handles an account with no phone yet", async () => {
      vi.mocked(getUser).mockResolvedValue(profile({ phone: null }));
      renderPage();
      const input = (await screen.findByLabelText("Phone Number")) as HTMLInputElement;
      expect(input.value).toBe("");
      expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    });
  });
});
