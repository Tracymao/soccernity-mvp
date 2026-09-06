// Route guard for every authenticated Admin Console screen.
//
//  - "loading"        → a minimal splash while GET /admin/profile settles
//  - "unauthenticated"→ redirect to /login, remembering where we were
//    headed so login can send the operator back
//  - "authenticated"  → render the protected tree
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAdminAuth } from "./AdminAuthContext";

export default function RequireAdminAuth() {
  const { status } = useAdminAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--sn-text-secondary)",
          fontSize: 14,
        }}
      >
        Loading the Admin Console…
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <Outlet />;
}
