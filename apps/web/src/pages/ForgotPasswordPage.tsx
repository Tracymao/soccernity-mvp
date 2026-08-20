// Forgot Password screen (Sprint 1, PR F4).
//
// Figma source: "Forgot Password", node 409:1264, "Soccernity-MVP" file
// (weZWWqggy9j13eX8bhFgs6). See src/components/auth/AuthLayout.tsx and
// src/components/auth/Auth.css for the two documented deviations from the
// literal frame (header/layout, and off-brand hex substitutions).
//
// Wiring: POST /auth/forgot-password (MVP Build Plan Section 4.1). As of
// this PR, B4 (services/api forgot/reset-password endpoints) had not yet
// merged to main -- see src/lib/authApi.ts for the contract this is built
// against. The call below is real and will run against a live API once B4
// merges and VITE_API_BASE_URL points at it; until then it will fail with
// a network/404 error, which the form surfaces as the same generic error
// state a real failure would.
//
// B4 deliberately returns the same generic response whether or not the
// email exists (to avoid leaking account existence), so the success state
// here must not claim to have found -- or not found -- the email.
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import AuthLayout from "../components/auth/AuthLayout";
import AuthField from "../components/auth/AuthField";
import AuthButton from "../components/auth/AuthButton";
import { forgotPassword } from "../lib/authApi";
import "../components/auth/Auth.css";

const GENERIC_SUBMITTED_MESSAGE =
  "If an account exists for that email, we've sent instructions to reset your password.";
const GENERIC_ERROR_MESSAGE = "Something went wrong sending that. Please try again in a moment.";

type Status = "idle" | "submitting" | "submitted" | "error";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email) {
      return;
    }
    setStatus("submitting");
    try {
      await forgotPassword(email);
      // Generic success state regardless of whether the email matched an
      // account -- do not branch on the response body here.
      setStatus("submitted");
    } catch {
      setStatus("error");
    }
  }

  return (
    <AuthLayout>
      <h1 className="sn-auth__title">Forgot Password</h1>
      <p className="sn-auth__subtitle">
        Enter the email you registered with. We will send you instructions to recover your password.
      </p>

      {status === "submitted" ? (
        <p className="sn-auth-status sn-auth-status--success" role="status">
          {GENERIC_SUBMITTED_MESSAGE}
        </p>
      ) : (
        <form className="sn-auth-form" onSubmit={handleSubmit} noValidate>
          {status === "error" ? (
            <p className="sn-auth-status sn-auth-status--error" role="alert">
              {GENERIC_ERROR_MESSAGE}
            </p>
          ) : null}

          <AuthField
            label="Email"
            type="email"
            name="email"
            placeholder="example@website.com"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <AuthButton type="submit" loading={status === "submitting"}>
            Verify!
          </AuthButton>
        </form>
      )}

      <p className="sn-auth-footer">
        Return to <Link to="/login">Login!</Link>
      </p>
    </AuthLayout>
  );
}
