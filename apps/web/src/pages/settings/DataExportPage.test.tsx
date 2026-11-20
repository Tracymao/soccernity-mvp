// DataExportPage (/settings/privacy/download-data): every state of the Figma set and each
// error. Mocks api/dataExport; session seeded into the in-memory store. The real endpoints are
// exercised by the Playwright spec.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import DataExportPage, { MESSAGES, POLL_INTERVAL_MS, POLL_WINDOW_MS } from "./DataExportPage";
import { DataExportApiError } from "../../api/dataExport";

vi.mock("../../api/dataExport", async () => {
  const actual = await vi.importActual<typeof import("../../api/dataExport")>("../../api/dataExport");
  return {
    ...actual,
    requestDataExport: vi.fn(),
    getLatestDataExport: vi.fn(),
    downloadDataExport: vi.fn(),
    saveBlobAsFile: vi.fn(),
  };
});

import { downloadDataExport, getLatestDataExport, requestDataExport, saveBlobAsFile } from "../../api/dataExport";
import { seedSession, clearSession } from "../../test/session";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => {
  clearSession();
  vi.mocked(requestDataExport).mockReset();
  vi.mocked(getLatestDataExport).mockReset();
  vi.mocked(downloadDataExport).mockReset();
  vi.mocked(saveBlobAsFile).mockReset();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/settings/privacy/download-data"]}>
      <DataExportPage />
    </MemoryRouter>,
  );
}

async function openForm() {
  seedSession("tok");
  vi.mocked(getLatestDataExport).mockResolvedValueOnce({ status: "none" });
  renderPage();
  await screen.findByRole("heading", { name: "Download my data" });
}

function typePassword(value: string) {
  fireEvent.change(screen.getByLabelText("Password"), { target: { value } });
}

const prepare = () => fireEvent.click(screen.getByRole("button", { name: "Prepare my file" }));

describe("signed out", () => {
  it("asks to log in and calls nothing", () => {
    renderPage();
    expect(screen.getByText(/log in to manage your privacy settings/i)).not.toBeNull();
    expect(getLatestDataExport).not.toHaveBeenCalled();
  });
});

describe("confirm password", () => {
  it("shows the form when there is no export yet, with Prepare disabled until a password is typed", async () => {
    await openForm();
    expect(screen.getByText(/get a copy of your own soccernity data/i)).not.toBeNull();
    expect(screen.getByText("Enter your password to continue.")).not.toBeNull();
    const button = screen.getByRole("button", { name: "Prepare my file" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    typePassword("pw");
    expect(button.disabled).toBe(false);
    expect(screen.getByRole("link", { name: "Cancel" }).getAttribute("href")).toBe("/settings/privacy");
    expect(requestDataExport).not.toHaveBeenCalled();
  });

  it("sends the password and moves to preparing", async () => {
    await openForm();
    vi.mocked(requestDataExport).mockResolvedValueOnce({ id: "e1", status: "preparing" });
    typePassword("pw");
    prepare();
    expect(await screen.findByRole("heading", { name: "Preparing your file" })).not.toBeNull();
    expect(requestDataExport).toHaveBeenCalledWith("tok", "pw");
  });

  it("disables the form while saving and ignores a second submit", async () => {
    await openForm();
    let resolve: (v: { id: string; status: "preparing" }) => void = () => {};
    vi.mocked(requestDataExport).mockReturnValueOnce(new Promise((r) => (resolve = r)));
    typePassword("pw");
    prepare();
    const input = (await screen.findByLabelText("Password")) as HTMLInputElement;
    await waitFor(() => expect(input.disabled).toBe(true));
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    expect(requestDataExport).toHaveBeenCalledTimes(1);
    resolve({ id: "e1", status: "preparing" });
    await screen.findByRole("heading", { name: "Preparing your file" });
  });
});

describe("wrong password", () => {
  it("flags the field, keeps what was typed and clears the flag on edit", async () => {
    await openForm();
    vi.mocked(requestDataExport).mockRejectedValueOnce(
      new DataExportApiError("x", { status: 403, code: "wrong_password" }),
    );
    typePassword("nope");
    prepare();
    expect(await screen.findByText(MESSAGES.wrongPassword)).not.toBeNull();
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    expect(input.value).toBe("nope");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(input));
    fireEvent.change(input, { target: { value: "nope2" } });
    expect(screen.queryByText(MESSAGES.wrongPassword)).toBeNull();
  });
});

describe("too many requests", () => {
  it("shows the frame wording with no number and only Back to Privacy", async () => {
    await openForm();
    vi.mocked(requestDataExport).mockRejectedValueOnce(
      new DataExportApiError("x", { status: 429, code: "too_many_requests" }),
    );
    typePassword("pw");
    prepare();
    expect(await screen.findByRole("heading", { name: "You’ve asked too many times" })).not.toBeNull();
    expect(screen.getByText("You can ask for a copy of your data again later.")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Back to Privacy" }).getAttribute("href")).toBe("/settings/privacy");
    expect(screen.queryByRole("button")).toBeNull();
    expect(document.body.textContent).not.toMatch(/\d+ (hours?|minutes?)/);
  });
});

describe("other start errors", () => {
  it("shows a plain line and stays on the form for a server error", async () => {
    await openForm();
    vi.mocked(requestDataExport).mockRejectedValueOnce(new DataExportApiError("x", { status: 500 }));
    typePassword("pw");
    prepare();
    expect(await screen.findByText(MESSAGES.startFailed)).not.toBeNull();
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("pw");
  });

  it("shows the network message for an unreachable server", async () => {
    await openForm();
    vi.mocked(requestDataExport).mockRejectedValueOnce(new DataExportApiError("Couldn't reach the Soccernity server."));
    typePassword("pw");
    prepare();
    expect(await screen.findByText("Couldn't reach the Soccernity server.")).not.toBeNull();
  });
});

describe("opening the page", () => {
  it("resumes the preparing view when an export is already being prepared", async () => {
    seedSession("tok");
    vi.mocked(getLatestDataExport).mockResolvedValueOnce({ status: "preparing", id: "e1" });
    renderPage();
    expect(await screen.findByRole("heading", { name: "Preparing your file" })).not.toBeNull();
  });

  it("goes straight to Ready when the file is ready", async () => {
    seedSession("tok");
    vi.mocked(getLatestDataExport).mockResolvedValueOnce({ status: "ready", id: "e1", expiresAt: "2026-11-20T10:00:00.000Z" });
    renderPage();
    expect(await screen.findByRole("heading", { name: "Your file is ready" })).not.toBeNull();
  });

  it("shows the Could not prepare screen for a failed export", async () => {
    seedSession("tok");
    vi.mocked(getLatestDataExport).mockResolvedValueOnce({ status: "failed", id: "e1" });
    renderPage();
    expect(await screen.findByRole("heading", { name: "We couldn’t prepare your file" })).not.toBeNull();
  });

  it("shows a retry when the first look fails, and retries", async () => {
    seedSession("tok");
    vi.mocked(getLatestDataExport).mockRejectedValueOnce(new DataExportApiError("x", { status: 500 }));
    renderPage();
    expect(await screen.findByText(MESSAGES.loadFailed)).not.toBeNull();
    vi.mocked(getLatestDataExport).mockResolvedValueOnce({ status: "none" });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Download my data" })).not.toBeNull();
  });
});

describe("preparing and polling", () => {
  async function startPreparing() {
    seedSession("tok");
    vi.mocked(getLatestDataExport).mockResolvedValueOnce({ status: "none" });
    renderPage();
    await screen.findByRole("heading", { name: "Download my data" });
    vi.mocked(requestDataExport).mockResolvedValueOnce({ id: "e1", status: "preparing" });
    typePassword("pw");
    prepare();
    await screen.findByRole("heading", { name: "Preparing your file" });
  }

  it("shows the frame wording and Cancel returns to Privacy without calling an endpoint", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await startPreparing();
    expect(screen.getByText("This can take a few minutes.")).not.toBeNull();
    expect(screen.getByRole("progressbar")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Cancel" }).getAttribute("href")).toBe("/settings/privacy");
  });

  it("checks every 5 seconds and moves to Ready when the file is ready", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await startPreparing();
    expect(getLatestDataExport).toHaveBeenCalledTimes(1); // the opening look only
    vi.mocked(getLatestDataExport).mockResolvedValueOnce({ status: "preparing" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(getLatestDataExport).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("heading", { name: "Preparing your file" })).not.toBeNull();
    vi.mocked(getLatestDataExport).mockResolvedValueOnce({ status: "ready", id: "e1", expiresAt: "2026-11-20T10:00:00.000Z" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(await screen.findByRole("heading", { name: "Your file is ready" })).not.toBeNull();
    // Ready: polling has stopped.
    const calls = vi.mocked(getLatestDataExport).mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
    });
    expect(vi.mocked(getLatestDataExport).mock.calls.length).toBe(calls);
  });

  it("moves to Could not prepare when the check says failed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await startPreparing();
    vi.mocked(getLatestDataExport).mockResolvedValueOnce({ status: "failed" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(await screen.findByRole("heading", { name: "We couldn’t prepare your file" })).not.toBeNull();
  });

  it("keeps polling through a failed check", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await startPreparing();
    vi.mocked(getLatestDataExport).mockRejectedValueOnce(new DataExportApiError("x", { status: 500 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(screen.getByRole("heading", { name: "Preparing your file" })).not.toBeNull();
    vi.mocked(getLatestDataExport).mockResolvedValueOnce({ status: "preparing" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(getLatestDataExport).toHaveBeenCalledTimes(3);
  });

  it("stops after 2 minutes with a still-preparing line and a Check again button", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await startPreparing();
    vi.mocked(getLatestDataExport).mockResolvedValue({ status: "preparing" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_WINDOW_MS);
    });
    expect(screen.getByText(MESSAGES.stalled)).not.toBeNull();
    expect(screen.getByRole("button", { name: "Check again" })).not.toBeNull();
    const calls = vi.mocked(getLatestDataExport).mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 4);
    });
    expect(vi.mocked(getLatestDataExport).mock.calls.length).toBe(calls);
  });

  it("Check again re-checks now and, while still preparing, starts a fresh window", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await startPreparing();
    vi.mocked(getLatestDataExport).mockResolvedValue({ status: "preparing" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_WINDOW_MS);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    });
    expect(await screen.findByText("Preparing…")).not.toBeNull();
    vi.mocked(getLatestDataExport).mockResolvedValueOnce({ status: "ready", id: "e1" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(await screen.findByRole("heading", { name: "Your file is ready" })).not.toBeNull();
  });

  it("stops polling when the person leaves the page", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await startPreparing();
    cleanup();
    const calls = vi.mocked(getLatestDataExport).mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 5);
    });
    expect(vi.mocked(getLatestDataExport).mock.calls.length).toBe(calls);
  });
});

describe("ready", () => {
  async function openReady() {
    seedSession("tok");
    vi.mocked(getLatestDataExport).mockResolvedValueOnce({ status: "ready", id: "e1", expiresAt: "2026-11-20T10:00:00.000Z" });
    renderPage();
    await screen.findByRole("heading", { name: "Your file is ready" });
  }

  it("shows the frame wording, the tagged sentence and the expiry", async () => {
    await openReady();
    expect(screen.getByText("Your data is ready to download as a JSON file.")).not.toBeNull();
    expect(screen.getByText(MESSAGES.personalData)).not.toBeNull();
    expect(MESSAGES.personalData).toContain("[COPY PENDING LEGAL REVIEW]");
    expect(screen.getByText(/The download only works for a limited time\. Available until /)).not.toBeNull();
    expect(screen.getByRole("link", { name: "Back to Privacy" }).getAttribute("href")).toBe("/settings/privacy");
  });

  it("fetches the file with the token and saves it as soccernity-data-export.json", async () => {
    await openReady();
    const blob = new Blob(["{}"]);
    vi.mocked(downloadDataExport).mockResolvedValueOnce(blob);
    fireEvent.click(screen.getByRole("button", { name: "Download file" }));
    await waitFor(() => expect(saveBlobAsFile).toHaveBeenCalledWith(blob, "soccernity-data-export.json"));
    expect(downloadDataExport).toHaveBeenCalledWith("tok", "e1");
  });

  it.each([
    [410, "data_export_expired"],
    [404, "data_export_not_found"],
  ])("a %i (%s) shows the expired screen with a way to ask again", async (status, code) => {
    await openReady();
    vi.mocked(downloadDataExport).mockRejectedValueOnce(new DataExportApiError("x", { status, code }));
    fireEvent.click(screen.getByRole("button", { name: "Download file" }));
    expect(await screen.findByRole("heading", { name: "This file isn’t available any more" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Prepare my file" }));
    expect(await screen.findByRole("heading", { name: "Download my data" })).not.toBeNull();
    expect(saveBlobAsFile).not.toHaveBeenCalled();
  });

  it("a 409 (not ready after all) goes back to preparing", async () => {
    await openReady();
    vi.mocked(downloadDataExport).mockRejectedValueOnce(
      new DataExportApiError("x", { status: 409, code: "data_export_not_ready" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Download file" }));
    expect(await screen.findByRole("heading", { name: "Preparing your file" })).not.toBeNull();
  });

  it("any other failure shows a plain line and keeps the button", async () => {
    await openReady();
    vi.mocked(downloadDataExport).mockRejectedValueOnce(new DataExportApiError("x", { status: 500 }));
    fireEvent.click(screen.getByRole("button", { name: "Download file" }));
    expect(await screen.findByText(MESSAGES.downloadFailed)).not.toBeNull();
    expect((screen.getByRole("button", { name: "Download file" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("could not prepare", () => {
  it("shows the frame wording; Try again returns to the password form", async () => {
    seedSession("tok");
    vi.mocked(getLatestDataExport).mockResolvedValueOnce({ status: "failed" });
    renderPage();
    expect(await screen.findByText("Something went wrong. Try again.")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Back to Privacy" }).getAttribute("href")).toBe("/settings/privacy");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Download my data" })).not.toBeNull();
  });
});
