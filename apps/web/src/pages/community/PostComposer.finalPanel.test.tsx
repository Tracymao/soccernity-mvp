import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import PostComposer from "./PostComposer";
import { openContest } from "../contest/contestFixtures";

afterEach(cleanup);

const UPLOAD = { kind: "final_upload", opensAt: "2026-09-22T07:00:00.000Z", revealsAt: "2026-09-24T23:00:00.000Z" } as const;

function renderComposer(over: Parameters<typeof openContest>[0] = {}) {
  return render(
    <MemoryRouter>
      <PostComposer
        accessToken="t"
        authorName="Ada Player"
        initialMode="contest"
        onCreated={() => undefined}
        contest={openContest({ calendarState: UPLOAD, callerIsFinalist: true, isAcceptingEntries: true, ...over })}
      />
    </MemoryRouter>,
  );
}

// Found by e2e spec 17 in real Chrome: the Week 4 panel has its own <form>, and a <form> inside a <form>
// sent the click to the outer (caption-less) handler, so the final entry was never submitted.
describe("PostComposer during the Week 4 upload window", () => {
  it("never nests the panel's form inside another form", async () => {
    const { container } = renderComposer();
    await screen.findByLabelText(/caption for your final entry/i);
    expect(container.querySelectorAll("form")).toHaveLength(1);
    expect(container.querySelector("form form")).toBeNull();
    // the one form is the panel's own, so the submit button belongs to it
    const submit = screen.getByRole("button", { name: /submit entry/i });
    expect(submit.closest("form")?.querySelector("#final-entry-video")).not.toBeNull();
  });

  it("is still a single form for the weekly composer", () => {
    const { container } = renderComposer({ calendarState: { kind: "week_entries", weekNumber: 1, entriesCloseAt: "2026-09-05T00:00:00.000Z" } as never, callerIsFinalist: false });
    expect(container.querySelectorAll("form")).toHaveLength(1);
  });
});
