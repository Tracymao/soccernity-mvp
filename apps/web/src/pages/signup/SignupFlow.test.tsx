// B-073 ordering: Age Gate (DOB + country) -> Guardian Details -> Register,
// and "Back to sign up" after a below-minimum-age denial clears DOB + country.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import SignupFlow from "./SignupFlow";

vi.mock("../../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../../api/auth")>("../../api/auth");
  return { ...actual, registerUser: vi.fn() };
});
vi.mock("./ClubPickerStep", () => ({ default: () => <div>club picker</div> }));
import { registerUser } from "../../api/auth";
import { clearSession } from "../../test/session";

beforeEach(() => {
  clearSession();
  vi.mocked(registerUser).mockReset();
});
afterEach(cleanup);

function dobForAge(age: number) {
  const now = new Date();
  return {
    day: String(now.getUTCDate()),
    month: String(now.getUTCMonth() + 1),
    year: String(now.getUTCFullYear() - age),
  };
}

function fillAgeGate(age: number, country: string) {
  const dob = dobForAge(age);
  fireEvent.change(screen.getByLabelText("Day of birth"), { target: { value: dob.day } });
  fireEvent.change(screen.getByLabelText("Month of birth"), { target: { value: dob.month } });
  fireEvent.change(screen.getByLabelText("Year of birth"), { target: { value: dob.year } });
  fireEvent.change(screen.getByLabelText("Country you live in"), { target: { value: country } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

function renderFlow() {
  return render(
    <MemoryRouter>
      <SignupFlow />
    </MemoryRouter>,
  );
}

describe("SignupFlow", () => {
  it("after a below-minimum-age denial, 'Back to sign up' returns to an empty Age Gate", () => {
    renderFlow();
    fillAgeGate(3, "GB");
    fireEvent.click(screen.getByRole("button", { name: "Back to sign up" }));

    expect((screen.getByLabelText("Year of birth") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Country you live in") as HTMLSelectElement).value).toBe("");
  });

  it("minor path: the Age Gate country reaches Register; Guardian Details has no country", async () => {
    vi.mocked(registerUser).mockResolvedValue({
      accessToken: "acc",
    } as Awaited<ReturnType<typeof registerUser>>);
    renderFlow();
    fillAgeGate(12, "US");

    expect(screen.queryByLabelText(/country/i)).toBeNull();
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Ada Okafor" } });
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText(/relationship to you/i), { target: { value: "Parent" } });
    fireEvent.click(screen.getByRole("button", { name: "Send approval request" }));

    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Tobi" } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Ade" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "tobi@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "longenough1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(registerUser).toHaveBeenCalled());
    expect(vi.mocked(registerUser).mock.calls[0][0]).toMatchObject({
      countryCode: "US",
      guardian: { name: "Ada Okafor", relationship: "Parent" },
    });
  });
});
