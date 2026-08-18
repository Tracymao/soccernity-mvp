// First component test file in apps/web (Decision Log #19) -- see
// vite.config.ts's `test` block and package.json's new
// @testing-library/react / jsdom devDependencies, added alongside this
// file rather than pre-existing.
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AgeGateStep from "./AgeGateStep";
import type { AgeGateValues } from "./types";

afterEach(cleanup);

const EMPTY_DOB: AgeGateValues = { day: "", month: "", year: "" };

// Mirrors age.ts's own UTC-based "age in whole years as of today" logic
// exactly, so a DOB built this way always parses to precisely `age`
// years old regardless of the real date the test suite runs on --
// avoids hardcoded date literals that would eventually go stale.
function dobForAge(age: number): AgeGateValues {
  const now = new Date();
  return {
    day: String(now.getUTCDate()),
    month: String(now.getUTCMonth() + 1),
    year: String(now.getUTCFullYear() - age),
  };
}

function renderAgeGate(initialValues: AgeGateValues = EMPTY_DOB) {
  const onContinue = vi.fn();
  render(
    <MemoryRouter>
      <AgeGateStep initialValues={initialValues} onContinue={onContinue} />
    </MemoryRouter>,
  );
  return { onContinue };
}

function fillDob(dob: AgeGateValues) {
  fireEvent.change(screen.getByLabelText("Day of birth"), { target: { value: dob.day } });
  fireEvent.change(screen.getByLabelText("Month of birth"), { target: { value: dob.month } });
  fireEvent.change(screen.getByLabelText("Year of birth"), { target: { value: dob.year } });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

describe("AgeGateStep", () => {
  describe("Decision Log #19 -- minimum signup age of 5", () => {
    it("rejects a date of birth resulting in age 4, without calling onContinue", () => {
      const { onContinue } = renderAgeGate();

      fillDob(dobForAge(4));
      submit();

      expect(screen.getByRole("alert").textContent).toMatch(/aged 5 and up/i);
      expect(onContinue).not.toHaveBeenCalled();
    });

    it("accepts a date of birth resulting in exactly age 5 (inclusive boundary)", () => {
      const { onContinue } = renderAgeGate();

      fillDob(dobForAge(5));
      submit();

      expect(screen.queryByRole("alert")).toBeNull();
      expect(onContinue).toHaveBeenCalledTimes(1);
      expect(onContinue).toHaveBeenCalledWith(dobForAge(5), 5, true);
    });

    // "Guardian details already filled in" doesn't map onto AgeGateStep
    // directly -- this component has no guardian fields at all (those
    // live on a separate step, GuardianDetailsStep, reached only *after*
    // AgeGateStep's onContinue fires) and there is in fact no path
    // through SignupFlow.tsx that reaches age-gate again with guardian
    // details already persisted in flow state (GuardianDetailsStep only
    // lifts its fields into SignupFlow's state on its own submit, which
    // advances straight past age-gate to Register with no way back).
    // The closest real, reachable version of "the block applies
    // regardless of what else is entered" at this component's own
    // boundary is: the form already had a prior, validly-parsed DOB
    // filled in (simulating a return visit) when the user changes it to
    // a sub-5 DOB -- prior state on the form doesn't bypass the check.
    it("still blocks age 4 even when the form already had a prior (different) date of birth filled in", () => {
      const { onContinue } = renderAgeGate(dobForAge(10));

      fillDob(dobForAge(4));
      submit();

      expect(screen.getByRole("alert").textContent).toMatch(/aged 5 and up/i);
      expect(onContinue).not.toHaveBeenCalled();
    });
  });

  describe("existing under-18 / 18+ branch (Decision Log #8)", () => {
    it("declares a 10-year-old a minor", () => {
      const { onContinue } = renderAgeGate();

      fillDob(dobForAge(10));
      submit();

      expect(onContinue).toHaveBeenCalledWith(dobForAge(10), 10, true);
    });

    it("declares a 25-year-old not a minor", () => {
      const { onContinue } = renderAgeGate();

      fillDob(dobForAge(25));
      submit();

      expect(onContinue).toHaveBeenCalledWith(dobForAge(25), 25, false);
    });

    it("declares exactly age 18 not a minor (threshold is exclusive)", () => {
      const { onContinue } = renderAgeGate();

      fillDob(dobForAge(18));
      submit();

      expect(onContinue).toHaveBeenCalledWith(dobForAge(18), 18, false);
    });
  });

  describe("existing date validation", () => {
    it("rejects an unparseable date of birth without calling onContinue", () => {
      const { onContinue } = renderAgeGate();

      fillDob({ day: "31", month: "2", year: "2015" });
      submit();

      expect(screen.getByRole("alert").textContent).toMatch(/enter a valid date of birth/i);
      expect(onContinue).not.toHaveBeenCalled();
    });
  });
});
