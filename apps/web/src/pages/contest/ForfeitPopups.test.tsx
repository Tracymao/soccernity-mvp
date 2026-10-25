import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ForfeitPopups from "./ForfeitPopups";
import VoteToggle from "./VoteToggle";

afterEach(cleanup);

describe("ForfeitPopups", () => {
  it("renders nothing when no week was forfeited", () => {
    render(<ForfeitPopups weeks={[]} />);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("shows one pop-up per forfeited week, oldest first, one after another, with the reason", () => {
    render(
      <ForfeitPopups
        weeks={[
          { weekNumber: 3, reason: "Reason three." },
          { weekNumber: 1, reason: "Reason one." },
        ]}
      />,
    );
    expect(screen.getByText("Week 1 was forfeited")).not.toBeNull();
    expect(screen.getByText(/Reason one\./)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.getByText("Week 3 was forfeited")).not.toBeNull();
    expect(screen.getByText(/Reason three\./)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("remembers nothing: a fresh mount shows the pop-ups again", () => {
    const weeks = [{ weekNumber: 1, reason: "Reason one." }];
    const first = render(<ForfeitPopups weeks={weeks} />);
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    first.unmount();
    render(<ForfeitPopups weeks={weeks} />);
    expect(screen.getByRole("alertdialog")).not.toBeNull();
  });
});

describe("VoteToggle", () => {
  it("is one control with two states, signalled by the label and aria-pressed", () => {
    const { rerender } = render(<VoteToggle voted={false} voteCount={1} onToggle={() => undefined} entrantName="Ada" />);
    const button = screen.getByRole("button", { name: "Vote for Ada" });
    expect(button.textContent).toBe("Vote");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("1 Vote")).not.toBeNull();
    rerender(<VoteToggle voted voteCount={2} onToggle={() => undefined} entrantName="Ada" />);
    const voted = screen.getByRole("button", { name: "Remove your vote for Ada" });
    expect(voted.textContent).toBe("Voted");
    expect(voted.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("2 Votes")).not.toBeNull();
  });

  it("calls onToggle on click and is disabled while busy", () => {
    let calls = 0;
    const { rerender } = render(<VoteToggle voted={false} voteCount={0} onToggle={() => (calls += 1)} entrantName="Ada" />);
    fireEvent.click(screen.getByRole("button"));
    expect(calls).toBe(1);
    rerender(<VoteToggle voted={false} voteCount={0} busy onToggle={() => (calls += 1)} entrantName="Ada" />);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });
});
