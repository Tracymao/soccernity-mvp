// sprint-1/coppa-card-verification. Plain DOM assertions only (this app's
// convention). Stripe's own modules and the API client are mocked -- what is
// under test is the gating, and that no card field exists in our own DOM.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import CardVerificationPanel from "./CardVerificationPanel";

vi.mock("@stripe/stripe-js", () => ({ loadStripe: vi.fn(() => Promise.resolve(null)) }));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  PaymentElement: () => <div data-testid="stripe-payment-element" />,
  useStripe: () => null,
  useElements: () => null,
}));
vi.mock("../../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../../api/auth")>("../../api/auth");
  return {
    ...actual,
    getGuardianVerificationRequirements: vi.fn(),
    createGuardianCardIntent: vi.fn(),
    completeGuardianCardVerification: vi.fn(),
  };
});
import { getGuardianVerificationRequirements } from "../../api/auth";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(getGuardianVerificationRequirements).mockReset();
});

describe("CardVerificationPanel", () => {
  it("renders nothing and reports not_required for the ordinary consent path", async () => {
    vi.mocked(getGuardianVerificationRequirements).mockResolvedValue({ cardRequired: false, cardVerified: false });
    const onGateChange = vi.fn();
    const { container } = render(<CardVerificationPanel token="t" onGateChange={onGateChange} />);
    await waitFor(() => expect(onGateChange).toHaveBeenCalledWith("not_required"));
    expect(container.textContent).toBe("");
  });

  it("reports needed and shows the step (with no card inputs of our own) when the API requires it", async () => {
    vi.mocked(getGuardianVerificationRequirements).mockResolvedValue({ cardRequired: true, cardVerified: false });
    const onGateChange = vi.fn();
    const { container } = render(<CardVerificationPanel token="t" onGateChange={onGateChange} />);
    await screen.findByTestId("card-verification-panel");
    expect(onGateChange).toHaveBeenCalledWith("needed");
    expect(container.querySelectorAll("input").length).toBe(0);
    expect(container.textContent).toContain("Soccernity never sees or stores them");
  });

  it("reports done once verified", async () => {
    vi.mocked(getGuardianVerificationRequirements).mockResolvedValue({ cardRequired: true, cardVerified: true });
    const onGateChange = vi.fn();
    render(<CardVerificationPanel token="t" onGateChange={onGateChange} />);
    await screen.findByTestId("card-verification-done");
    expect(onGateChange).toHaveBeenCalledWith("done");
  });

  it("does not invent a card step when the lookup fails (the server re-checks on submit)", async () => {
    vi.mocked(getGuardianVerificationRequirements).mockRejectedValue(new Error("boom"));
    const onGateChange = vi.fn();
    render(<CardVerificationPanel token="t" onGateChange={onGateChange} />);
    await waitFor(() => expect(onGateChange).toHaveBeenCalledWith("not_required"));
  });
});
