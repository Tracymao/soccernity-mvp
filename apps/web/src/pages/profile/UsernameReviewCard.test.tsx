// Username-review card on Create Profile (B-139 part (c), Decision Log #467): every state, every error,
// focus and the "server decides, client computes nothing" rule.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import UsernameReviewCard from "./UsernameReviewCard";
import { UsernameReviewApiError } from "../../api/usernameReview";

vi.mock("../../api/usernameReview", async () => {
  const actual = await vi.importActual<typeof import("../../api/usernameReview")>("../../api/usernameReview");
  return { ...actual, getUsernameReviewStatus: vi.fn(), requestUsernameReview: vi.fn() };
});
import { getUsernameReviewStatus, requestUsernameReview } from "../../api/usernameReview";

const TAG = "[COPY PENDING LEGAL REVIEW]";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(getUsernameReviewStatus).mockReset();
  vi.mocked(requestUsernameReview).mockReset();
});

function status(state: "none" | "can_request" | "pending" | "declined" | "reinstated") {
  vi.mocked(getUsernameReviewStatus).mockResolvedValue({ state, requestableUntil: null });
}

function renderCard(onReinstated = vi.fn()) {
  render(<UsernameReviewCard accessToken="tok" onReinstated={onReinstated} />);
  return onReinstated;
}

async function openForm() {
  fireEvent.click(await screen.findByRole("button", { name: "Ask for a review" }));
  return screen.getByLabelText("Message (optional)") as HTMLTextAreaElement;
}

describe("UsernameReviewCard: what the server's state shows", () => {
  it.each(["none", "reinstated"] as const)("renders nothing for %s", async (state) => {
    status(state);
    const { container } = render(<UsernameReviewCard accessToken="tok" onReinstated={vi.fn()} />);
    await waitFor(() => expect(getUsernameReviewStatus).toHaveBeenCalled());
    await act(async () => {});
    expect(container.textContent).toBe("");
  });

  it("renders nothing while loading and when the status cannot be read (the username form still works)", async () => {
    vi.mocked(getUsernameReviewStatus).mockRejectedValue(new UsernameReviewApiError("boom", { status: 500 }));
    const { container } = render(<UsernameReviewCard accessToken="tok" onReinstated={vi.fn()} />);
    expect(container.textContent).toBe("");
    await act(async () => {});
    expect(container.textContent).toBe("");
  });

  it("can_request: the entry card, wording from the frame without the handle, an 'Ask for a review' button", async () => {
    status("can_request");
    renderCard();
    expect(await screen.findByRole("heading", { name: "Your username was removed" })).not.toBeNull();
    expect(screen.getByText(`Your username was removed by Soccernity. ${TAG}`)).not.toBeNull();
    expect(screen.getByText(/ask for a review of the removal\. You can ask once, within 30 days of the removal\./)).not.toBeNull();
    expect(screen.getByRole("button", { name: "Ask for a review" })).not.toBeNull();
    expect(document.body.textContent).not.toContain("@");
  });

  it("pending: title, the Pending pill and both lines, no date and no button", async () => {
    status("pending");
    renderCard();
    expect(await screen.findByRole("heading", { name: "Your review request" })).not.toBeNull();
    expect(screen.getByText("Pending")).not.toBeNull();
    expect(screen.getByText(`You asked for a review. Our team is looking at it. ${TAG}`)).not.toBeNull();
    expect(screen.getByText(`The result will appear here, and you will get a notification. ${TAG}`)).not.toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(document.body.textContent).not.toMatch(/\d{4}/);
  });

  it("declined: final, no way to ask again, tells the person to choose a new username", async () => {
    status("declined");
    renderCard();
    expect(await screen.findByRole("heading", { name: "Review decided" })).not.toBeNull();
    expect(screen.getByText("Declined")).not.toBeNull();
    expect(screen.getByText(/decision is final and cannot be reviewed again/)).not.toBeNull();
    expect(screen.getByText(`Choose a new username below to continue. ${TAG}`)).not.toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("UsernameReviewCard: the request form", () => {
  it("opens with the message field focused, a 0 / 500 counter and the frame's note", async () => {
    status("can_request");
    renderCard();
    const field = await openForm();
    expect(screen.getByRole("heading", { name: "Ask for a review" })).not.toBeNull();
    expect(document.activeElement).toBe(field);
    expect(field.maxLength).toBe(500);
    expect(screen.getByText("0 / 500")).not.toBeNull();
    expect(screen.getByText(`A different member of our team reviews your request. Their decision is final. ${TAG}`)).not.toBeNull();
    expect(field.getAttribute("aria-describedby")?.split(" ")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Send request" })).not.toBeNull();
  });

  it("counts the characters as the person types", async () => {
    status("can_request");
    renderCard();
    const field = await openForm();
    fireEvent.change(field, { target: { value: "I think this was a mistake." } });
    expect(screen.getByText("27 / 500")).not.toBeNull();
  });

  it("Cancel closes the form without sending anything and puts focus back on 'Ask for a review'", async () => {
    status("can_request");
    renderCard();
    await openForm();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    const ask = await screen.findByRole("button", { name: "Ask for a review" });
    await waitFor(() => expect(document.activeElement).toBe(ask));
    expect(requestUsernameReview).not.toHaveBeenCalled();
  });

  it("sends the typed message, shows 'Sending…' with the form disabled, then the sent confirmation", async () => {
    status("can_request");
    let resolve!: (v: { state: "pending"; requestableUntil: null }) => void;
    vi.mocked(requestUsernameReview).mockReturnValue(new Promise((r) => (resolve = r)));
    renderCard();
    const field = await openForm();
    fireEvent.change(field, { target: { value: "It was my own name." } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));

    const sending = await screen.findByRole("button", { name: "Sending…" });
    expect((sending as HTMLButtonElement).disabled).toBe(true);
    expect(field.disabled).toBe(true);
    expect(requestUsernameReview).toHaveBeenCalledWith("tok", "It was my own name.");

    await act(async () => resolve({ state: "pending", requestableUntil: null }));
    expect(await screen.findByRole("heading", { name: "Your review request" })).not.toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Request sent");
    expect(screen.getByText(`We’ll show the result here and send you a notification when it’s decided. ${TAG}`)).not.toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("an empty message is allowed (the field is optional)", async () => {
    status("can_request");
    vi.mocked(requestUsernameReview).mockResolvedValue({ state: "pending", requestableUntil: null });
    renderCard();
    await openForm();
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(requestUsernameReview).toHaveBeenCalledWith("tok", ""));
  });

  it("does not send twice on a double submit", async () => {
    status("can_request");
    vi.mocked(requestUsernameReview).mockReturnValue(new Promise(() => {}));
    renderCard();
    await openForm();
    const send = screen.getByRole("button", { name: "Send request" });
    fireEvent.click(send);
    fireEvent.submit(send.closest("form") as HTMLFormElement);
    await screen.findByRole("button", { name: "Sending…" });
    expect(requestUsernameReview).toHaveBeenCalledTimes(1);
  });
});

describe("UsernameReviewCard: errors, chosen by the server's code", () => {
  async function sendFailing(error: UsernameReviewApiError, message = "") {
    status("can_request");
    vi.mocked(requestUsernameReview).mockRejectedValue(error);
    renderCard();
    const field = await openForm();
    if (message) fireEvent.change(field, { target: { value: message } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    return field;
  }

  it("a network failure or server error: frame 09 'Couldn't send your request', the form and text kept, can retry", async () => {
    const field = await sendFailing(new UsernameReviewApiError("Couldn't reach the Soccernity server."), "keep me");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(`Couldn’t send your request. Check your connection and try again. ${TAG}`);
    expect(field.value).toBe("keep me");
    expect((screen.getByRole("button", { name: "Send request" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("409 username_review_already_requested: frame 10, and Cancel then shows the pending card", async () => {
    await sendFailing(new UsernameReviewApiError("English that must not be shown", { status: 409, code: "username_review_already_requested" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(`You’ve already asked for a review of this removal. The result will appear here. ${TAG}`);
    expect(document.body.textContent).not.toContain("English that must not be shown");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Pending")).not.toBeNull();
  });

  it("403 username_review_window_closed: the window-passed card, the form is gone, no button to ask", async () => {
    await sendFailing(new UsernameReviewApiError("x", { status: 403, code: "username_review_window_closed" }));
    expect(await screen.findByText(`The time to ask for a review has passed. ${TAG}`)).not.toBeNull();
    expect(screen.getByText(`Choose a new username below to continue. ${TAG}`)).not.toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("403 username_review_not_available: a plain line, form stays", async () => {
    await sendFailing(new UsernameReviewApiError("x", { status: 403, code: "username_review_not_available" }));
    expect((await screen.findByRole("alert")).textContent).toBe("There is no username removal to ask a review of.");
  });

  it("429: a plain 'too many attempts' line", async () => {
    await sendFailing(new UsernameReviewApiError("ThrottlerException: Too Many Requests", { status: 429 }));
    expect((await screen.findByRole("alert")).textContent).toBe("Too many attempts. Wait a minute and try again.");
  });

  it("400 (message too long after trimming): shows the server's own sentence", async () => {
    await sendFailing(new UsernameReviewApiError("Your message must be at most 500 characters.", { status: 400, code: "username_review_message_invalid" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Your message must be at most 500 characters.");
  });
});

describe("UsernameReviewCard: a person waiting on a decision", () => {
  it("re-reads the status when the window regains focus and shows a decline without a reload", async () => {
    status("pending");
    renderCard();
    await screen.findByText("Pending");
    status("declined");
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(await screen.findByRole("heading", { name: "Review decided" })).not.toBeNull();
  });

  it("calls onReinstated when a pending request disappears (the person has their username back)", async () => {
    status("pending");
    const onReinstated = renderCard();
    await screen.findByText("Pending");
    status("none");
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(onReinstated).toHaveBeenCalledTimes(1));
  });

  it("does not poll on focus when nothing is pending", async () => {
    status("can_request");
    renderCard();
    await screen.findByRole("button", { name: "Ask for a review" });
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(getUsernameReviewStatus).toHaveBeenCalledTimes(1);
  });
});
