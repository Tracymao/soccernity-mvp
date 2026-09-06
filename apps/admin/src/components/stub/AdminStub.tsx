// Shared primitives for the Admin Console section screens whose backend
// does not exist yet (Build Plan Section 4.8 — most of it is unbuilt).
//
// The discipline (CLAUDE.md, and every apps/web figma-to-code PR): the
// screen's real Figma LAYOUT is reproduced — headings, table columns,
// form fields, action buttons — but every control is visibly disabled
// and a banner states plainly that it isn't wired to anything. Sample
// rows/values are clearly captioned "Sample". Nothing is faked as
// working; nothing is silently omitted.
//
// When a section's endpoints land, its screen's PR swaps these stubs for
// real data — the layout stays.
import type { ReactNode } from "react";
import AdminPageHeader from "../../layout/AdminPageHeader";
import "./AdminStub.css";

export function StubBanner({ children }: { children: ReactNode }) {
  return (
    <div className="admin-stub__banner" role="note">
      <strong>Not available yet.</strong> {children}
    </div>
  );
}

export function StubSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="admin-stub__section">
      <h2 className="admin-stub__section-title">{title}</h2>
      {children}
    </section>
  );
}

export function StubField({ label, value, kind = "text" }: {
  label: string;
  value?: string;
  kind?: "text" | "textarea" | "select" | "readonly";
}) {
  return (
    <label className="admin-stub__field">
      <span className="admin-stub__field-label">{label}</span>
      {kind === "textarea" ? (
        <textarea disabled defaultValue={value} rows={4} />
      ) : kind === "readonly" ? (
        <div className="admin-stub__field-value">{value ?? "—"}</div>
      ) : kind === "select" ? (
        <select disabled defaultValue="">
          <option value="">{value ?? "Select…"}</option>
        </select>
      ) : (
        <input disabled defaultValue={value} placeholder={value ? undefined : "—"} />
      )}
    </label>
  );
}

export function StubButton({ children, variant = "primary" }: {
  children: ReactNode;
  variant?: "primary" | "outline";
}) {
  return (
    <button
      type="button"
      disabled
      className={"admin-stub__btn admin-stub__btn--" + variant}
      title="Not available yet"
    >
      {children}
    </button>
  );
}

export function StubTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div className="admin-stub__table-wrap">
      <p className="admin-stub__sample-caption">Sample — not real data</p>
      <table className="admin-stub__table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The standard wrapper: page header + disclosure banner + the reproduced
// layout.
export default function AdminStubScreen({
  title,
  backLink,
  banner,
  children,
}: {
  title: string;
  backLink?: ReactNode;
  banner: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      {backLink ? <div className="admin-stub__back">{backLink}</div> : null}
      <AdminPageHeader title={title} hideSearch />
      <StubBanner>{banner}</StubBanner>
      <div className="admin-stub__body">{children}</div>
    </>
  );
}
