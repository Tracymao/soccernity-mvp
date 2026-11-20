// Labeled text input matching the "Form Group" pattern in the auth Figma
// frames (e.g. node 409:1272). No shared Input primitive exists yet to
// reuse -- Login (F2) and Signup (F3) are still route stubs (PlaceholderPage)
// as of this PR, built concurrently in separate worktrees, so there is
// nothing built to reuse from them. This is intentionally the first form
// primitive for the auth flow; a future pass should promote it to
// packages/shared if F2/F3 land their own near-duplicates.
import type { InputHTMLAttributes } from "react";
import "./Auth.css";

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export default function AuthField({ label, error, id, ...inputProps }: AuthFieldProps) {
  const fieldId = id ?? `sn-auth-field-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const errorId = error ? `${fieldId}-error` : undefined;

  return (
    <div className="sn-auth-field">
      <label className="sn-auth-field__label" htmlFor={fieldId}>
        {label}
      </label>
      <input
        id={fieldId}
        className="sn-auth-field__input"
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        {...inputProps}
      />
      {error ? (
        <p className="sn-auth-field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
