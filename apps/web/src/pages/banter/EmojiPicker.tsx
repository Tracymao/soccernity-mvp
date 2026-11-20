// Small self-contained emoji picker for the Bants "Create a topic" dialog (Figma pass Y: 7061:63618
// desktop, 7060:63607 mobile). An "Emoji" label over a 3 x 6 grid of 32 px cells. No dependency, no
// search, no skin tones: a fixed set of 18 emoji, football ones included. The frames' set, in order.
//
// Keyboard: the grid is ONE tab stop (roving tabindex). Arrow keys move by cell, Home/End jump to the
// ends of the row, Enter/Space picks. Escape closes the picker and the dialog stays open (the event is
// stopped so the dialog's own Escape handler does not also run). Each cell has an accessible name.
//
// Picking does not insert anything itself: it calls onPick(emoji, keepOpen). `keepOpen` is true when
// Shift was held, so several can be added in a row; the dialog closes the picker otherwise.
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import "./EmojiPicker.css";

interface EmojiOption {
  emoji: string;
  /** Screen reader name. */
  name: string;
}

// Row by row, as the frames draw them.
export const EMOJI_OPTIONS: readonly EmojiOption[] = [
  { emoji: "😀", name: "grinning face" },
  { emoji: "😂", name: "face with tears of joy" },
  { emoji: "😍", name: "smiling face with heart eyes" },
  { emoji: "😎", name: "smiling face with sunglasses" },
  { emoji: "🤔", name: "thinking face" },
  { emoji: "😢", name: "crying face" },
  { emoji: "👍", name: "thumbs up" },
  { emoji: "👏", name: "clapping hands" },
  { emoji: "🔥", name: "fire" },
  { emoji: "⚽", name: "soccer ball" },
  { emoji: "🏆", name: "trophy" },
  { emoji: "🎉", name: "party popper" },
  { emoji: "💪", name: "flexed biceps" },
  { emoji: "🙌", name: "raising hands" },
  { emoji: "❤️", name: "red heart" },
  { emoji: "👀", name: "eyes" },
  { emoji: "😅", name: "grinning face with sweat" },
  { emoji: "🤝", name: "handshake" },
];

const COLUMNS = 6;

interface Props {
  id: string;
  /** How many UTF-16 code units can still be added to the field; a cell that would not fit is disabled. */
  remaining: number;
  onPick: (emoji: string, keepOpen: boolean) => void;
  /** Escape or a click outside. `returnFocus` is true for Escape. */
  onClose: (returnFocus: boolean) => void;
  /** The button that opened the picker: a press on it is the caller's toggle, not an "outside" press. */
  openerRef: { current: HTMLElement | null };
}

export default function EmojiPicker({ id, remaining, onPick, onClose, openerRef }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [active, setActive] = useState(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Focus the first cell when the picker opens (the person opened it on purpose).
  useEffect(() => {
    cellRefs.current[0]?.focus({ preventScroll: true });
  }, []);

  // A press outside the picker (and not on its opener) closes it without moving focus.
  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (openerRef.current?.contains(t)) return;
      closeRef.current(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [openerRef]);

  function focusCell(index: number) {
    const next = Math.max(0, Math.min(EMOJI_OPTIONS.length - 1, index));
    setActive(next);
    cellRefs.current[next]?.focus({ preventScroll: true });
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        onClose(true);
        return;
      case "ArrowRight":
        e.preventDefault();
        focusCell(active + 1);
        return;
      case "ArrowLeft":
        e.preventDefault();
        focusCell(active - 1);
        return;
      case "ArrowDown":
        e.preventDefault();
        focusCell(active + COLUMNS);
        return;
      case "ArrowUp":
        e.preventDefault();
        focusCell(active - COLUMNS);
        return;
      case "Home":
        e.preventDefault();
        focusCell(active - (active % COLUMNS));
        return;
      case "End":
        e.preventDefault();
        focusCell(active - (active % COLUMNS) + COLUMNS - 1);
        return;
      default:
    }
  }

  function pick(e: ReactMouseEvent<HTMLButtonElement>, option: EmojiOption) {
    if (option.emoji.length > remaining) return;
    onPick(option.emoji, e.shiftKey);
  }

  return (
    <div ref={rootRef} id={id} className="emoji-picker" role="group" aria-label="Emoji" onKeyDown={onKeyDown}>
      <p className="emoji-picker__label" aria-hidden="true">
        Emoji
      </p>
      <div className="emoji-picker__grid">
        {EMOJI_OPTIONS.map((option, i) => {
          const fits = option.emoji.length <= remaining;
          return (
            <button
              key={option.emoji}
              ref={(el) => {
                cellRefs.current[i] = el;
              }}
              type="button"
              className="emoji-picker__cell"
              tabIndex={i === active ? 0 : -1}
              aria-label={option.name}
              aria-disabled={fits ? undefined : true}
              onFocus={() => setActive(i)}
              onClick={(e) => pick(e, option)}
            >
              <span aria-hidden="true">{option.emoji}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
