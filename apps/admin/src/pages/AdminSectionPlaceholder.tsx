// The honest "designed, not built" state for every Admin Console section
// that PR 1 does not implement.
//
// The 29 Admin Panel screens are fully designed in Figma (all instancing
// the shared "Admin Shell", node 6014:12948). PR 1 ships the shell, the
// isolated admin auth path, and the Admin Profile identity hydration —
// nothing else. Each remaining section is converted by its own
// figma-to-code PR (see CLAUDE.md "Where things stand"), at which point
// that section's route stops rendering this component.
//
// This is NOT a "coming soon" marketing state — it names what exists
// (the design) and what does not (the screen + usually the backend), so
// a reviewer or operator is never misled about what the console can do.
import AdminPageHeader from "../layout/AdminPageHeader";

interface AdminSectionPlaceholderProps {
  title: string;
  /** One line on the backend state, e.g. "No `GET /admin/dashboard/stats`
   *  endpoint exists yet (Build Plan Section 4.8)." */
  backendNote: string;
}

export default function AdminSectionPlaceholder({ title, backendNote }: AdminSectionPlaceholderProps) {
  return (
    <>
      <AdminPageHeader title={title} hideSearch />
      <div className="admin-placeholder">
        <p className="admin-placeholder__lede">
          The <strong>{title}</strong> section is designed in Figma but not yet built in this app.
        </p>
        <p className="admin-placeholder__note">{backendNote}</p>
        <p className="admin-placeholder__note">
          Tracking: CLAUDE.md “Where things stand right now”. This screen is replaced by its real
          conversion in a later PR.
        </p>
      </div>
      <style>{`
        .admin-placeholder {
          max-width: 60ch;
          padding: 24px;
          border: 1px dashed var(--sn-icon-inactive);
          border-radius: 8px;
          background-color: var(--sn-green-tint-12);
        }
        .admin-placeholder__lede {
          margin: 0 0 12px;
          font-size: 16px;
          color: var(--sn-text-primary);
        }
        .admin-placeholder__note {
          margin: 8px 0 0;
          font-size: 13px;
          color: var(--sn-text-secondary);
        }
      `}</style>
    </>
  );
}
