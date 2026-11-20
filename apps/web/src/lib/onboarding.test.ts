import { describe, it, expect } from "vitest";
import { ONBOARDING_ROUTES, routeForNextStep } from "./onboarding";

describe("routeForNextStep (B-125)", () => {
  it("maps each server nextStep to its route", () => {
    expect(routeForNextStep("restricted_pending")).toBe("/guardian-consent");
    expect(routeForNextStep("verify_email")).toBe("/verify-email/prompt");
    expect(routeForNextStep("create_profile")).toBe("/create-profile");
    expect(routeForNextStep("none")).toBe("/community");
  });

  it("never sends a restricted-pending account to the app home", () => {
    expect(routeForNextStep("restricted_pending")).not.toBe(ONBOARDING_ROUTES.home);
  });

  it("fails toward the account-status page for a value this build does not know", () => {
    // @ts-expect-error -- simulating a future server value
    expect(routeForNextStep("something_new")).toBe("/guardian-consent");
  });
});
