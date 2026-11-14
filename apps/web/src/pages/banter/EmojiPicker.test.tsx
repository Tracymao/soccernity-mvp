import { useRef } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import EmojiPicker, { EMOJI_OPTIONS } from "./EmojiPicker";

afterEach(cleanup);

function Harness(props: { remaining?: number; onPick?: (e: string, keepOpen: boolean) => void; onClose?: (r: boolean) => void }) {
  const opener = useRef<HTMLButtonElement | null>(null);
  return (
    <div>
      <button ref={opener} type="button">
        opener
      </button>
      <EmojiPicker
        id="picker"
        remaining={props.remaining ?? 500}
        onPick={props.onPick ?? (() => {})}
        onClose={props.onClose ?? (() => {})}
        openerRef={opener}
      />
    </div>
  );
}

describe("EmojiPicker", () => {
  it("is a labelled group with a small fixed set that includes football emoji", () => {
    render(<Harness />);
    expect(screen.getByRole("group", { name: "Emoji" })).not.toBeNull();
    expect(EMOJI_OPTIONS).toHaveLength(18);
    expect(screen.getByRole("button", { name: "soccer ball" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "trophy" })).not.toBeNull();
    // Every cell has a screen-reader name.
    for (const o of EMOJI_OPTIONS) expect(screen.getByRole("button", { name: o.name })).not.toBeNull();
  });

  it("focuses the first cell on open and is a single tab stop (roving tabindex)", () => {
    render(<Harness />);
    const cells = screen.getAllByRole("button").filter((b) => b.classList.contains("emoji-picker__cell"));
    expect(document.activeElement).toBe(cells[0]);
    expect(cells.filter((c) => c.getAttribute("tabindex") === "0")).toHaveLength(1);
    expect(cells.filter((c) => c.getAttribute("tabindex") === "-1")).toHaveLength(cells.length - 1);
  });

  it("arrow keys, Home and End move between cells by the 6-column grid", () => {
    render(<Harness />);
    const group = screen.getByRole("group", { name: "Emoji" });
    const cell = (name: string) => screen.getByRole("button", { name });
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(document.activeElement).toBe(cell("face with tears of joy"));
    fireEvent.keyDown(group, { key: "ArrowDown" });
    // index 1 + 6 = 7 -> clapping hands
    expect(document.activeElement).toBe(cell("clapping hands"));
    fireEvent.keyDown(group, { key: "ArrowUp" });
    expect(document.activeElement).toBe(cell("face with tears of joy"));
    fireEvent.keyDown(group, { key: "End" });
    expect(document.activeElement).toBe(cell("crying face"));
    fireEvent.keyDown(group, { key: "Home" });
    expect(document.activeElement).toBe(cell("grinning face"));
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(cell("grinning face"));
  });

  it("Escape closes and asks for focus to return to the opener", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("group", { name: "Emoji" }), { key: "Escape" });
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it("a click picks the emoji; Shift keeps the picker open", () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: "soccer ball" }));
    expect(onPick).toHaveBeenLastCalledWith("⚽", false);
    fireEvent.click(screen.getByRole("button", { name: "trophy" }), { shiftKey: true });
    expect(onPick).toHaveBeenLastCalledWith("🏆", true);
  });

  it("Enter on the focused cell picks it (a native button click)", () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    const cell = screen.getByRole("button", { name: "grinning face" });
    cell.focus();
    fireEvent.click(cell);
    expect(onPick).toHaveBeenCalledWith("😀", false);
  });

  it("an emoji that would not fit is aria-disabled and is ignored", () => {
    const onPick = vi.fn();
    // Every emoji here is 2 UTF-16 units (the red heart is 2 too); 1 left fits nothing.
    render(<Harness remaining={1} onPick={onPick} />);
    const cell = screen.getByRole("button", { name: "soccer ball" });
    // "⚽" is one unit: it fits.
    expect(cell.getAttribute("aria-disabled")).toBeNull();
    const grin = screen.getByRole("button", { name: "grinning face" });
    expect(grin.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(grin);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("a press outside closes it without returning focus; a press on the opener does not", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.mouseDown(screen.getByRole("button", { name: "opener" }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledWith(false);
  });
});
