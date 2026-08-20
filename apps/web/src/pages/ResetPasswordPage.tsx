// Reset Password screen (Sprint 1, PR F4).
//
// Figma source: "Reset Password", node 409:1463, "Soccernity-MVP" file
// (weZWWqggy9j13eX8bhFgs6). See src/components/auth/AuthLayout.tsx and
// src/components/auth/Auth.css for the two documented deviations from the
// literal frame (header/layout, and off-brand hex substitutions).
//
// Wiring: POST /auth/reset-password (MVP Build Plan Section 4.1), reading
// the reset token from the ?token= query param the emailed link is
// expected to carry. As of this PR, B4 (services/api forgot/reset-password
// endpoints) had not yet merged to main -- see src/lib/authApi.ts for the
// contract this is built against. The call below is real and will run
// against a live API once B4 merges and VITE_API_BASE_URL points at it;
// until then it will fail with a network/404 error, surfaced as the same
// generic error state a real failure (e.g. expired token) would use.
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import AuthLayout from "../components/auth/AuthLayout";
import AuthField from "../components/auth/AuthField";
import AuthButton from "../components/auth/AuthButton";
import { resetPassword } from "../lib/authApi";
import "../components/auth/Auth.css";

const MIN_PASSWORD_LENGTH = 8;
const GENERIC_ERROR_MESSAGE =
  "We couldn't reset your password with that link. It may have expired -- request a new one.";

type Status = "idle" | "submitting" | "submitted" | "error";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setValidationError("Passwords do not match.");
      return;
    }
    if (!token) {
      setStatus("error");
      return;
    }

    setStatus("submitting");
    try {
      await resetPassword(token, password);
      setStatus("submitted");
    } catch {
      setStatus("error");
    }
  }

  return (
    <AuthLayout>
      <h1 className="sn-auth__title">Reset Password</h1>
      <p className="sn-auth__subtitle">Choose a new secure password.</p>

      {!token ? (
        <p className="sn-auth-status sn-auth-status--error" role="alert">
          This reset link is missing or invalid. Request a new one from the{" "}
          <Link to="/forgot-password">Forgot Password</Link> page.
        </p>
      ) : status === "submitted" ? (
        <p className="sn-auth-status sn-auth-status--success" role="status">
          Your password has been reset. You can now log in with your new password.
        </p>
      ) : (
        <form className="sn-auth-form" onSubmit={handleSubmit} noValidate>
          {status === "error" ? (
            <p className="sn-auth-status sn-auth-status--error" role="alert">
              {GENERIC_ERROR_MESSAGE}
            </p>
          ) : null}
          {validationError ? (
            <p className="sn-auth-status sn-auth-status--error" role="alert">
              {validationError}
            </p>
          ) : null}

          <AuthField
            label="Password"
            type="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          <AuthField
            label="Confirm Password"
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />

          <AuthButton type="submit" loading={status === "submitting"}>
            Reset
          </AuthButton>
        </form>
      )}

      <p className="sn-auth-footer">
        Return to <Link to="/login">Login!</Link>
      </p>
    </AuthLayout>
  );
}
