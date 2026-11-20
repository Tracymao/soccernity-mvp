// Six boxed digits for an authenticator code (Figma "Code Input -- 6 digits", 6655:73 and
// 6711:27530). One real <input> per box so each is focusable, with the behaviour people
// expect from a one-time code: typing moves on, Backspace on an empty box moves back, and a
// paste (or an OS "from messages" autofill into the first box) fills all six.
//
// The value is held by the parent as a plain string of up to six digits. Nothing is stored
// or logged here.
import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

const LENGTH = 6;

interface Props {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  /** Accessible name for the group, e.g. "6-digit code". */
  label: string;
}

export default function TwoFactorCodeInput({ value, onChange, disabled, invalid, autoFocus, label }: Props) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  function focusBox(index: number) {
    const box = refs.current[Math.max(0, Math.min(LENGTH - 1, index))];
    box?.focus();
    box?.select();
  }

  // The value is always a contiguous run of digits, so typing or pasting into a box beyond the
  // first empty one fills from the first empty box instead of leaving a gap.
  function setDigits(index: number, digits: string) {
    if (digits.length === 1 && index < value.length) {
      // Overwriting one filled box keeps the digits after it.
      onChange(value.slice(0, index) + digits + value.slice(index + 1));
      focusBox(index + 1);
      return;
    }
    const start = Math.min(index, value.length);
    const next = (value.slice(0, start) + digits).slice(0, LENGTH);
    onChange(next);
    focusBox(Math.min(start + digits.length, LENGTH - 1));
  }

  function handleChange(index: number, raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (digits === "") {
      // The box was cleared.
      const chars = value.padEnd(LENGTH, " ").split("");
      chars[index] = " ";
      onChange(chars.join("").trimEnd().replace(/ /g, ""));
      return;
    }
    setDigits(index, digits);
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !value[index]) {
      event.preventDefault();
      focusBox(index - 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusBox(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focusBox(index + 1);
    }
  }

  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    const digits = event.clipboardData.getData("text").replace(/\D/g, "");
    if (!digits) return;
    event.preventDefault();
    setDigits(index, digits);
  }

  return (
    <div className="tf-code" role="group" aria-label={label}>
      {Array.from({ length: LENGTH }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className={`tf-code__digit${invalid ? " tf-code__digit--invalid" : ""}`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={i === 0 ? LENGTH : 1}
          aria-label={`Digit ${i + 1} of ${LENGTH}`}
          aria-invalid={invalid || undefined}
          value={value[i] ?? ""}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}
