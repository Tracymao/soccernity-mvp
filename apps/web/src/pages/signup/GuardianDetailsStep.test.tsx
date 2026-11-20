// B-075 (Decision Log #393 (a), Option A): one "Guardian's full name" field,
// no country select.
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import GuardianDetailsStep from "./GuardianDetailsStep";
import type { GuardianDetailsValues } from "./types";

afterEach(cleanup);

const EMPTY: GuardianDetailsValues = { name: "", email: "", relationship: "" };

function renderStep() {
  const onContinue = vi.fn();
  render(
    <MemoryRouter>
      <GuardianDetailsStep
        dob={{ day: "4", month: "9", year: "2011" }}
        age={14}
        initialValues={EMPTY}
        onBack={vi.fn()}
        onContinue={onContinue}
      />
    </MemoryRouter>,
  );
  return { onContinue };
}

describe("GuardianDetailsStep", () => {
  it("has one full-name field and no country select", () => {
    renderStep();
    expect(screen.getByLabelText(/full name/i)).not.toBeNull();
    expect(screen.queryByLabelText(/first name/i)).toBeNull();
    expect(screen.queryByLabelText(/last name/i)).toBeNull();
    expect(screen.queryByLabelText(/country/i)).toBeNull();
  });

  it("continues with a single trimmed name, email and relationship", () => {
    const { onContinue } = renderStep();
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "  Ada Okafor " } });
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText(/relationship to you/i), { target: { value: "Parent" } });
    fireEvent.click(screen.getByRole("button", { name: "Send approval request" }));

    expect(onContinue).toHaveBeenCalledWith({ name: "Ada Okafor", email: "ada@example.com", relationship: "Parent" });
  });

  it("requires the name", () => {
    const { onContinue } = renderStep();
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText(/relationship to you/i), { target: { value: "Parent" } });
    fireEvent.click(screen.getByRole("button", { name: "Send approval request" }));

    expect(screen.getByRole("alert").textContent).toMatch(/full name/i);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("says the approval link lasts 3 days", () => {
    renderStep();
    expect(screen.getByText(/expires after 3 days/i)).not.toBeNull();
  });
});
