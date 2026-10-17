// Route wrapper for the one-time Club Picker (B-125). It used to render inline
// from RegisterStep's success view; Decision Log #367 puts it AFTER Create
// Profile, and joining a club needs a verified email (B-118) and, for a minor,
// guardian approval (B-026) -- so it is reached from Create Profile, with the
// session that registration/login persisted.
import { Navigate, useNavigate } from "react-router";
import ClubPickerStep from "./ClubPickerStep";
import { ONBOARDING_ROUTES } from "../../lib/onboarding";
import { getStoredAccessToken } from "../../lib/session";

export default function ClubPickerRoute() {
  const navigate = useNavigate();
  const token = getStoredAccessToken();
  if (!token) return <Navigate to="/login" replace />;
  return <ClubPickerStep accessToken={token} onDone={() => navigate(ONBOARDING_ROUTES.home)} />;
}
