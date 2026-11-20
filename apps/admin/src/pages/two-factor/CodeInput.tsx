// Six-box one-time-code entry (Figma "Enter your authentication code" 6900:32510, enrolment step 2
// 6899:32549). One real <input> sits transparently over six drawn cells, so paste, browser
// autofill (autocomplete="one-time-code"), the on-screen keyboard and screen readers all behave like
// an ordinary field; the cells only show what it holds.
import { useEffect, useRef } from "react";

export const CODE_LENGTH = 6;

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** Focus the field on mount and whenever this value changes (e.g. after a wrong code clears it). */
  focusKey?: number;
}

export default function CodeInput({ id, label, value, onChange, disabled, focusKey = 0 }: Props) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!disabled) ref.current?.focus();
  }, [focusKey, disabled]);

  const active = Math.min(value.length, CODE_LENGTH - 1);

  return (
    <div className="tf-code">
      <label className="tf-sr-only" htmlFor={id}>
        {label}
      </label>
      <div className="tf-code__cells" aria-hidden="true">
        {Array.from({ length: CODE_LENGTH }, (_, i) => (
          <span
            key={i}
            className={`tf-code__cell${i === active && !disabled ? " tf-code__cell--active" : ""}${
              disabled ? " tf-code__cell--disabled" : ""
            }`}
          >
            {value[i] ?? ""}
          </span>
        ))}
      </div>
      <input
        ref={ref}
        id={id}
        className="tf-code__input"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={CODE_LENGTH}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
      />
    </div>
  );
}
