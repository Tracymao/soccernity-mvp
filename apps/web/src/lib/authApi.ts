// Auth Service client calls -- see MVP Build Plan Section 4.1 for the
// endpoint list this is built against:
//   POST /auth/forgot-password
//   POST /auth/reset-password
//
// SPRINT 1 STATUS (PR F4, forgot/reset-password screens): as of this PR,
// PR B4 (which implements these two endpoints in services/api) had not yet
// merged to main. These calls are wired to the Section 4 contract shape,
// not to a confirmed live response shape -- once B4 merges, diff its
// actual request/response DTOs against the types below and adjust if they
// drifted.
import { apiPost } from "./apiClient";

export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponse {
  message: string;
}

// B4 deliberately returns the same generic response whether or not the
// email exists, to avoid leaking account existence. Callers must not
// branch UI copy on this response beyond a single generic "check your
// email" state.
export function forgotPassword(email: string): Promise<ForgotPasswordResponse> {
  return apiPost<ForgotPasswordResponse, ForgotPasswordRequest>("/auth/forgot-password", {
    email,
  });
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface ResetPasswordResponse {
  message: string;
}

export function resetPassword(token: string, newPassword: string): Promise<ResetPasswordResponse> {
  return apiPost<ResetPasswordResponse, ResetPasswordRequest>("/auth/reset-password", {
    token,
    newPassword,
  });
}
