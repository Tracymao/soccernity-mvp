// ContactPage (B-046 / B-047). Plain DOM assertions, mocking src/api/contact.ts (the POST) and
// src/api/users.ts (the signed-in prefill). The endpoint itself is services/api's own test suite's job
// (contact.controller.http.spec.ts, test/contact.e2e-spec.ts) and the real browser path is e2e spec 21.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import ContactPage from "./ContactPage";
import { CONTACT_MESSAGE_MAX_LENGTH, ContactApiError } from "../api/contact";
import type { UserProfile } from "../api/users";

vi.mock("../api/contact", async () => {
  const actual = await vi.importActual<typeof import("../api/contact")>("../api/contact");
  return { ...actual, submitContactEnquiry: vi.fn() };
});
vi.mock("../api/users", async () => {
  const actual = await vi.importActual<typeof import("../api/users")>("../api/users");
  return { ...actual, getUser: vi.fn() };
});

import { submitContactEnquiry } from "../api/contact";
import { getUser } from "../api/users";
import { clearSession, seedSession } from "../test/session";

function b64(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fakeToken(sub = "user-1"): string {
  return `${b64({ alg: "none" })}.${b64({ sub, role: "fan" })}.sig`;
}

const PROFILE = {
  id: "user-1",
  email: "adeniyi@example.com",
  displayName: "Adeniyi Christiana",
} as UserProfile;

const originalWidth = window.innerWidth;
function setWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true, writable: true });
}

afterEach(() => {
  cleanup();
  setWidth(originalWidth);
});
beforeEach(() => {
  clearSession();
  vi.mocked(submitContactEnquiry).mockReset();
  vi.mocked(getUser).mockReset();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/contact"]}>
      <Routes>
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/privacy" element={<p>privacy page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const nameField = () => screen.getByLabelText("Name") as HTMLInputElement;
const emailField = () => screen.getByLabelText("Email") as HTMLInputElement;
const subjectField = () => screen.getByLabelText("Subject") as HTMLInputElement;
const messageField = () => screen.getByLabelText("Message") as HTMLTextAreaElement;
const categoryButton = () => screen.getByRole("combobox", { name: "Category" });

function chooseCategory(label: string) {
  fireEvent.click(categoryButton());
  fireEvent.click(screen.getByRole("option", { name: label }));
}

function fillValid() {
  fireEvent.change(nameField(), { target: { value: "  Sam Guest  " } });
  fireEvent.change(emailField(), { target: { value: " sam@example.com " } });
  chooseCategory("Technical issues");
  fireEvent.change(subjectField(), { target: { value: " Live score not updating " } });
  fireEvent.change(messageField(), { target: { value: " The score stopped. " } });
}

describe("ContactPage — the form as drawn", () => {
  it("renders the hero, the title, five fields and the Submit button (desktop wording)", () => {
    renderPage();
    expect(screen.getByText("Feel The Passion,")).toBeTruthy();
    expect(screen.getByText("Enjoy the Game.")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Contact Us" })).toBeTruthy();
    expect(nameField().placeholder).toBe("Name");
    expect(emailField().placeholder).toBe("Email");
    expect(screen.getByText("Choose a category")).toBeTruthy();
    expect(subjectField().placeholder).toBe("Email Subject");
    expect(messageField().placeholder).toBe("Enter your message here");
    expect(screen.getByRole("button", { name: "Submit" })).toBeTruthy();
  });

  it("uses the mobile frame's wording at <= 820px", () => {
    setWidth(390);
    renderPage();
    expect(emailField().placeholder).toBe("Email Address");
    expect(screen.getByText("Select Category")).toBeTruthy();
  });

  it("the category dropdown lists the six options, in order", () => {
    renderPage();
    fireEvent.click(categoryButton());
    const options = within(screen.getByRole("listbox", { name: "Category" })).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "Technical issues",
      "Editorial Complaints",
      "Data",
      "Suggestions",
      "Enquiries",
      "Feedback",
    ]);
  });

  it("choosing an option closes the list and shows the label", () => {
    renderPage();
    chooseCategory("Suggestions");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(within(categoryButton()).getByText("Suggestions")).toBeTruthy();
  });

  it("the dropdown works from the keyboard (arrows, Enter) and Escape closes it", () => {
    renderPage();
    const button = categoryButton();
    fireEvent.keyDown(button, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(button, { key: "ArrowDown" });
    fireEvent.keyDown(button, { key: "Enter" });
    expect(within(button).getByText("Editorial Complaints")).toBeTruthy();

    fireEvent.keyDown(button, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(button, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("shows the tagged notice under the form with a real link to /privacy", () => {
    renderPage();
    expect(screen.getByText("[COPY PENDING LEGAL REVIEW]")).toBeTruthy();
    expect(screen.getByText(/^Our support team reads the messages sent through this form\./)).toBeTruthy();
    expect(screen.getByText(/12 months after the last message in the enquiry/)).toBeTruthy();
    const link = screen.getByRole("link", { name: "Privacy Policy" });
    expect(link.getAttribute("href")).toBe("/privacy");
  });

  it("caps the fields at the lengths the endpoint accepts", () => {
    renderPage();
    expect(nameField().maxLength).toBe(200);
    expect(emailField().maxLength).toBe(254);
    expect(subjectField().maxLength).toBe(200);
    expect(messageField().maxLength).toBe(3000);
  });

  // The page has no JS length error: the textarea's maxLength is what stops a 3001st character in a browser (jsdom
  // does not enforce it on a programmatic change), and the endpoint 400s on 3001. So the boundary here is the
  // attribute at 3000 and a message of exactly 3000 characters going out whole.
  it("sends a message of exactly 3000 characters, line breaks kept, unchanged", async () => {
    vi.mocked(submitContactEnquiry).mockResolvedValueOnce(undefined as never);
    renderPage();
    fillValid();
    const message = `${"a".repeat(1499)}
${"b".repeat(1500)}`;
    expect(message).toHaveLength(3000);
    expect(CONTACT_MESSAGE_MAX_LENGTH).toBe(3000);
    expect(messageField().maxLength).toBe(message.length);
    fireEvent.change(messageField(), { target: { value: message } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByText("Message sent");
    expect(vi.mocked(submitContactEnquiry).mock.calls[0][0].message).toBe(message);
  });
});

describe("ContactPage — validation", () => {
  it("an empty submit shows all five errors, sends nothing and focuses the first invalid field", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.getByText("Enter your name.")).toBeTruthy();
    expect(screen.getByText("Enter a valid email address.")).toBeTruthy();
    expect(screen.getByText("Choose a category.")).toBeTruthy();
    expect(screen.getByText("Enter a subject.")).toBeTruthy();
    expect(screen.getByText("Enter a message.")).toBeTruthy();
    expect(submitContactEnquiry).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(nameField());
    expect(nameField().getAttribute("aria-invalid")).toBe("true");
  });

  it("an unfinished email address (the frame's example, adeniyi@) is invalid", () => {
    renderPage();
    fireEvent.change(emailField(), { target: { value: "adeniyi@" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.getByText("Enter a valid email address.")).toBeTruthy();
  });

  it("whitespace-only text counts as empty", () => {
    renderPage();
    fireEvent.change(nameField(), { target: { value: "   " } });
    fireEvent.change(messageField(), { target: { value: "  \n " } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.getByText("Enter your name.")).toBeTruthy();
    expect(screen.getByText("Enter a message.")).toBeTruthy();
  });

  it("an error clears as soon as that field is edited", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    fireEvent.change(nameField(), { target: { value: "S" } });
    expect(screen.queryByText("Enter your name.")).toBeNull();
    expect(screen.getByText("Enter a subject.")).toBeTruthy();
    chooseCategory("Data");
    expect(screen.queryByText("Choose a category.")).toBeNull();
  });
});

describe("ContactPage — submitting", () => {
  it("a guest submits trimmed values with no access token, then sees the success state", async () => {
    vi.mocked(submitContactEnquiry).mockResolvedValue(undefined);
    renderPage();
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await screen.findByText("Message sent");
    expect(submitContactEnquiry).toHaveBeenCalledTimes(1);
    expect(submitContactEnquiry).toHaveBeenCalledWith(
      {
        name: "Sam Guest",
        email: "sam@example.com",
        category: "technical_issues",
        subject: "Live score not updating",
        message: "The score stopped.",
      },
      null,
    );
    expect(screen.getByText("Thank you for getting in touch.")).toBeTruthy();
    // The form (and with it the notice) is replaced.
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.queryByText("[COPY PENDING LEGAL REVIEW]")).toBeNull();
  });

  it("each category sends its server value", async () => {
    const expected: [string, string][] = [
      ["Technical issues", "technical_issues"],
      ["Editorial Complaints", "editorial_complaints"],
      ["Data", "data"],
      ["Suggestions", "suggestions"],
      ["Enquiries", "enquiries"],
      ["Feedback", "feedback"],
    ];
    for (const [label, value] of expected) {
      vi.mocked(submitContactEnquiry).mockReset();
      vi.mocked(submitContactEnquiry).mockResolvedValue(undefined);
      renderPage();
      fillValid();
      chooseCategory(label);
      fireEvent.click(screen.getByRole("button", { name: "Submit" }));
      await screen.findByText("Message sent");
      expect(vi.mocked(submitContactEnquiry).mock.calls[0][0].category).toBe(value);
      cleanup();
    }
  });

  it("shows Sending… with a disabled button and dimmed fields while the request is in flight", async () => {
    let resolve!: () => void;
    vi.mocked(submitContactEnquiry).mockReturnValue(new Promise<void>((r) => (resolve = r)));
    renderPage();
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    const sending = await screen.findByRole("button", { name: "Sending…" });
    expect((sending as HTMLButtonElement).disabled).toBe(true);
    expect(nameField().disabled).toBe(true);
    expect(messageField().disabled).toBe(true);

    // A second click while in flight sends nothing more.
    fireEvent.click(sending);
    expect(submitContactEnquiry).toHaveBeenCalledTimes(1);

    await act(async () => resolve());
    await screen.findByText("Message sent");
  });

  it("a 429 shows the rate-limited line, keeps every value and lets the person try again", async () => {
    vi.mocked(submitContactEnquiry).mockRejectedValueOnce(new ContactApiError("limit", { status: 429 }));
    renderPage();
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "Each person can send a limited number of messages in an hour. You can send another later.",
    );
    expect(nameField().value).toBe("  Sam Guest  ");
    expect(subjectField().value).toBe(" Live score not updating ");
    expect((screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement).disabled).toBe(false);

    vi.mocked(submitContactEnquiry).mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByText("Message sent");
  });

  it("a server error shows the generic line and keeps the values", async () => {
    vi.mocked(submitContactEnquiry).mockRejectedValueOnce(new ContactApiError("boom", { status: 500 }));
    renderPage();
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Something went wrong and your message wasn’t sent. Try again.");
    expect(messageField().value).toBe(" The score stopped. ");
  });

  it("a network failure (no status) shows the same generic line", async () => {
    vi.mocked(submitContactEnquiry).mockRejectedValueOnce(new ContactApiError("Couldn't reach the Soccernity server."));
    renderPage();
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Something went wrong");
  });

  it("a 400 is also the generic line (the server's own text is never shown)", async () => {
    vi.mocked(submitContactEnquiry).mockRejectedValueOnce(new ContactApiError("email must be an email", { status: 400 }));
    renderPage();
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Something went wrong");
  });

  it("'Send another message' returns to an empty form", async () => {
    vi.mocked(submitContactEnquiry).mockResolvedValue(undefined);
    renderPage();
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    fireEvent.click(await screen.findByRole("button", { name: "Send another message" }));

    expect(nameField().value).toBe("");
    expect(emailField().value).toBe("");
    expect(subjectField().value).toBe("");
    expect(messageField().value).toBe("");
    expect(screen.getByText("Choose a category")).toBeTruthy();
    expect(screen.getByText("[COPY PENDING LEGAL REVIEW]")).toBeTruthy();
  });
});

describe("ContactPage — signed in", () => {
  it("prefills Name and Email from the account, editable, and sends the access token", async () => {
    const token = fakeToken("user-1");
    seedSession(token);
    vi.mocked(getUser).mockResolvedValue(PROFILE);
    vi.mocked(submitContactEnquiry).mockResolvedValue(undefined);
    renderPage();

    await waitFor(() => expect(nameField().value).toBe("Adeniyi Christiana"));
    expect(emailField().value).toBe("adeniyi@example.com");
    expect(getUser).toHaveBeenCalledWith(token, "user-1");

    fireEvent.change(emailField(), { target: { value: "other@example.com" } });
    chooseCategory("Suggestions");
    fireEvent.change(subjectField(), { target: { value: "An idea" } });
    fireEvent.change(messageField(), { target: { value: "Add a thing." } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await screen.findByText("Message sent");
    expect(submitContactEnquiry).toHaveBeenCalledWith(
      {
        name: "Adeniyi Christiana",
        email: "other@example.com",
        category: "suggestions",
        subject: "An idea",
        message: "Add a thing.",
      },
      token,
    );
  });

  it("never overwrites what the person has already typed when the profile arrives late", async () => {
    seedSession(fakeToken("user-1"));
    let resolveProfile!: (p: UserProfile) => void;
    vi.mocked(getUser).mockReturnValue(new Promise<UserProfile>((r) => (resolveProfile = r)));
    renderPage();

    fireEvent.change(nameField(), { target: { value: "Typed Name" } });
    await act(async () => resolveProfile(PROFILE));

    expect(nameField().value).toBe("Typed Name");
    expect(emailField().value).toBe("adeniyi@example.com");
  });

  it("'Send another message' restores the prefill, not a blank form", async () => {
    seedSession(fakeToken("user-1"));
    vi.mocked(getUser).mockResolvedValue(PROFILE);
    vi.mocked(submitContactEnquiry).mockResolvedValue(undefined);
    renderPage();
    await waitFor(() => expect(nameField().value).toBe("Adeniyi Christiana"));
    chooseCategory("Data");
    fireEvent.change(subjectField(), { target: { value: "s" } });
    fireEvent.change(messageField(), { target: { value: "m" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    fireEvent.click(await screen.findByRole("button", { name: "Send another message" }));

    expect(nameField().value).toBe("Adeniyi Christiana");
    expect(emailField().value).toBe("adeniyi@example.com");
    expect(subjectField().value).toBe("");
  });

  it("a failed profile lookup leaves the form empty and usable", async () => {
    seedSession(fakeToken("user-1"));
    vi.mocked(getUser).mockRejectedValue(new Error("nope"));
    renderPage();
    await waitFor(() => expect(getUser).toHaveBeenCalled());
    expect(nameField().value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.getByText("Enter your name.")).toBeTruthy();
  });

  it("a guest never calls the profile endpoint", () => {
    renderPage();
    expect(getUser).not.toHaveBeenCalled();
  });
});
