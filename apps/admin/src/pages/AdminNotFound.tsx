import { Link } from "react-router-dom";
import AdminPageHeader from "../layout/AdminPageHeader";

export default function AdminNotFound() {
  return (
    <>
      <AdminPageHeader title="Page not found" hideSearch />
      <p style={{ color: "var(--sn-text-secondary)", fontSize: 14 }}>
        That Admin Console path doesn’t exist. <Link to="/dashboard">Go to Dashboard</Link>.
      </p>
    </>
  );
}
