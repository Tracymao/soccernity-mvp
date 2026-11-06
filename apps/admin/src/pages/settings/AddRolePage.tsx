// Add Role — Figma node 1658:2456 ("Settings - Add new role"). B-057, Decision Log #378 / #379 item 10.
//
// Real data: POST /admin/staff (feat/admin-staff-create, PR #340, Decision Log #191) creates an AdminUser from
// email / fullName / role plus an optional temporary password. The whole route is superadmin-only on the
// server (AdminRolesGuard('superadmin')), so a superadmin may grant any of the three roles and nobody else
// may grant any: an admin whose role is known not to be superadmin sees a plain "not allowed" card and no form.
// The server is still the real gate (a 403 is handled too).
//
// The frame draws Email, Name, Role, Create Password, Confirm Password and Submit. The server's password is
// OPTIONAL (omitted -> it generates one and returns it once), so the two password fields are optional here:
// leave both empty to have one generated and shown once. If either is filled, both are required, they must
// match, and the length rule is the server's (8 to 128). No email is sent to the new admin — whoever adds the
// account has to pass the password on themselves.
//
// The frame has no success or error states; they are built plainly from the same card. Errors are chosen by
// HTTP status (the endpoint sends no error codes): 409 = email already used, 403 = not allowed, 400 = the
// server rejected a field, anything else = a generic retry line. The password is held in component state only:
// never stored, never put in a URL, dropped when the form is reset or the page unmounts.
import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from "react";
import { Link } from "react-router";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { useOptionalAdminAuth } from "../../auth/AdminAuthContext";
import { AdminApiError } from "../../api/adminClient";
import {
  ADMIN_STAFF_EMAIL_MAX,
  ADMIN_STAFF_NAME_MAX,
  ADMIN_STAFF_PASSWORD_MAX,
  ADMIN_STAFF_PASSWORD_MIN,
  ADMIN_STAFF_ROLES,
  createStaff,
  type AdminStaffRole,
  type CreatedAdminStaff,
} from "../../api/adminStaff";
import "./settings.css";
import "./addRole.css";

const ROLE_LABELS: Record<AdminStaffRole, string> = {
  editor: "Editor",
  moderator: "Moderator",
  superadmin: "Super Admin",
};

// The simplest shape check; the server's @IsEmail() stays the real validator.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldKey = "email" | "name" | "role" | "password" | "confirm";
type FieldErrors = Partial<Record<FieldKey, string>>;

const FIELD_ORDER: FieldKey[] = ["email", "name", "role", "password", "confirm"];

export function validateAddRole(values: {
  email: string;
  name: string;
  role: string;
  password: string;
  confirm: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  const email = values.email.trim();
  const name = values.name.trim();

  if (!email) errors.email = "Enter an email address.";
  else if (email.length > ADMIN_STAFF_EMAIL_MAX || !EMAIL_SHAPE.test(email)) errors.email = "Enter a valid email address.";

  if (!name) errors.name = "Enter a name.";
  else if (name.length > ADMIN_STAFF_NAME_MAX) errors.name = `Use ${ADMIN_STAFF_NAME_MAX} characters or fewer.`;

  if (!(ADMIN_STAFF_ROLES as readonly string[]).includes(values.role)) errors.role = "Choose a role.";

  // Both empty = the server generates one. Anything typed in either field means a password was meant.
  if (values.password !== "" || values.confirm !== "") {
    if (values.password.length < ADMIN_STAFF_PASSWORD_MIN) {
      errors.password = `Use at least ${ADMIN_STAFF_PASSWORD_MIN} characters.`;
    } else if (values.password.length > ADMIN_STAFF_PASSWORD_MAX) {
      errors.password = `Use ${ADMIN_STAFF_PASSWORD_MAX} characters or fewer.`;
    } else if (values.confirm === "") {
      errors.confirm = "Confirm the password.";
    } else if (values.confirm !== values.password) {
      errors.confirm = "The passwords don't match.";
    }
  }
  return errors;
}

export default function AddRolePage() {
  const auth = useOptionalAdminAuth();
  // Known and not a superadmin -> nothing to grant. Unknown (no provider / not hydrated) -> show the form; the server decides.
  const callerRole = auth?.admin?.role;
  const notAllowedUpFront = callerRole !== undefined && callerRole !== "superadmin";

  const uid = useId();
  const ids: Record<FieldKey, string> = {
    email: `${uid}-email`,
    name: `${uid}-name`,
    role: `${uid}-role`,
    password: `${uid}-password`,
    confirm: `${uid}-confirm`,
  };
  const emailRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const roleRef = useRef<HTMLSelectElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const refs: Record<FieldKey, RefObject<HTMLInputElement | HTMLSelectElement | null>> = {
    email: emailRef,
    name: nameRef,
    role: roleRef,
    password: passwordRef,
    confirm: confirmRef,
  };

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<CreatedAdminStaff | null>(null);
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const inFlight = useRef(false);
  // Fields are disabled while saving, so a focus request after a failed save waits until saving has ended.
  const [focusAfterSave, setFocusAfterSave] = useState<FieldKey | null>(null);
  useEffect(() => {
    if (focusAfterSave && !saving) {
      refs[focusAfterSave].current?.focus();
      setFocusAfterSave(null);
    }
  }, [focusAfterSave, saving]);

  function clearError(key: FieldKey) {
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
    setFormError(null);
  }

  function reset() {
    setEmail("");
    setName("");
    setRole("");
    setPassword("");
    setConfirm("");
    setErrors({});
    setFormError(null);
    setCreated(null);
    setCopied("idle");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    setFormError(null);

    const found = validateAddRole({ email, name, role, password, confirm });
    if (Object.values(found).some(Boolean)) {
      setErrors(found);
      const first = FIELD_ORDER.find((k) => found[k]);
      if (first) refs[first].current?.focus();
      return;
    }
    setErrors({});

    inFlight.current = true;
    setSaving(true);
    try {
      const result = await createStaff({
        email: email.trim(),
        fullName: name.trim(),
        role: role as AdminStaffRole,
        ...(password !== "" ? { temporaryPassword: password } : {}),
      });
      setPassword("");
      setConfirm("");
      setCreated(result);
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 409) {
        setErrors({ email: "An admin account with this email already exists." });
        setFocusAfterSave("email");
      } else if (err instanceof AdminApiError && err.status === 403) {
        setFormError("You aren't allowed to add accounts. Only a Super Admin can.");
      } else if (err instanceof AdminApiError && err.status === 400) {
        setFormError("Some of these details weren't accepted. Check them and try again.");
      } else {
        setFormError("Couldn't create the account. Check the connection and try again.");
      }
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  async function copyPassword(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }

  const back = (
    <div className="rl-back">
      <Link to="/settings">← Roles</Link>
    </div>
  );

  if (notAllowedUpFront) {
    return (
      <>
        <AdminPageHeader title="Roles" />
        <div className="rl-page">
          {back}
          <div className="rl-card ar-card">
            <h2 className="rl-card__title">Add a New Role</h2>
            <p className="rl-note">You aren't allowed to add accounts. Only a Super Admin can.</p>
          </div>
        </div>
      </>
    );
  }

  if (created) {
    const label = ROLE_LABELS[created.role] ?? created.role;
    return (
      <>
        <AdminPageHeader title="Roles" />
        <div className="rl-page">
          {back}
          <div className="rl-card ar-card" role="status">
            <h2 className="rl-card__title">Account created</h2>
            <p className="rl-success">
              {created.fullName} can now sign in as {label}.
            </p>
            <div className="rl-field-row">
              <span className="rl-field-row__label">Name</span>
              <span className="rl-field-row__value">{created.fullName}</span>
            </div>
            <div className="rl-field-row">
              <span className="rl-field-row__label">Email</span>
              <span className="rl-field-row__value">{created.email}</span>
            </div>
            <div className="rl-field-row">
              <span className="rl-field-row__label">Role</span>
              <span className="rl-field-row__value">{label}</span>
            </div>

            {created.temporaryPassword ? (
              <div className="rl-callout">
                <span className="rl-callout__bar" aria-hidden />
                <div className="ar-generated">
                  <p>
                    A password was generated for this account. It is shown <strong>only once</strong> and no email
                    is sent, so copy it and give it to {created.fullName} yourself.
                  </p>
                  <code className="ar-generated__value" data-testid="generated-password">
                    {created.temporaryPassword}
                  </code>
                  <div className="ar-generated__row">
                    <button
                      type="button"
                      className="rl-btn rl-btn--outline rl-btn--sm"
                      onClick={() => copyPassword(created.temporaryPassword as string)}
                    >
                      Copy password
                    </button>
                    {copied === "done" ? <span className="rl-note">Copied.</span> : null}
                    {copied === "failed" ? (
                      <span className="rl-note">Couldn't copy. Select the password and copy it by hand.</span>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <p className="rl-note">They sign in with the password you set. No email was sent, so tell them yourself.</p>
            )}

            <div className="ar-actions ar-actions--split">
              <button type="button" className="rl-btn rl-btn--outline" onClick={reset}>
                Add another
              </button>
              <Link to="/settings" className="ar-pill">
                Back to Roles
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  const errId = (key: FieldKey) => `${ids[key]}-err`;

  return (
    <>
      <AdminPageHeader title="Roles" />
      <div className="rl-page">
        {back}
        <form className="rl-card ar-card" onSubmit={handleSubmit} noValidate aria-busy={saving}>
          <h2 className="rl-card__title">Add a New Role</h2>

          {formError ? (
            <p className="rl-error" role="alert">
              {formError}
            </p>
          ) : null}

          <div className="ar-field">
            <label htmlFor={ids.email}>Email</label>
            <input
              id={ids.email}
              ref={emailRef}
              type="email"
              autoComplete="off"
              value={email}
              disabled={saving}
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? errId("email") : undefined}
              onChange={(e) => {
                setEmail(e.target.value);
                clearError("email");
              }}
            />
            {errors.email ? (
              <p className="ar-field__error" id={errId("email")}>
                {errors.email}
              </p>
            ) : null}
          </div>

          <div className="ar-field">
            <label htmlFor={ids.name}>Name</label>
            <input
              id={ids.name}
              ref={nameRef}
              type="text"
              autoComplete="off"
              value={name}
              disabled={saving}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? errId("name") : undefined}
              onChange={(e) => {
                setName(e.target.value);
                clearError("name");
              }}
            />
            {errors.name ? (
              <p className="ar-field__error" id={errId("name")}>
                {errors.name}
              </p>
            ) : null}
          </div>

          <div className="ar-field">
            <label htmlFor={ids.role}>Role</label>
            <select
              id={ids.role}
              ref={roleRef}
              value={role}
              disabled={saving}
              aria-invalid={errors.role ? true : undefined}
              aria-describedby={errors.role ? errId("role") : undefined}
              onChange={(e) => {
                setRole(e.target.value);
                clearError("role");
              }}
            >
              <option value="" disabled>
                Choose a role
              </option>
              {ADMIN_STAFF_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            {errors.role ? (
              <p className="ar-field__error" id={errId("role")}>
                {errors.role}
              </p>
            ) : null}
          </div>

          <div className="ar-field">
            <label htmlFor={ids.password}>Create Password</label>
            <input
              id={ids.password}
              ref={passwordRef}
              type="password"
              autoComplete="new-password"
              value={password}
              disabled={saving}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? errId("password") : `${ids.password}-hint`}
              onChange={(e) => {
                setPassword(e.target.value);
                clearError("password");
              }}
            />
            {errors.password ? (
              <p className="ar-field__error" id={errId("password")}>
                {errors.password}
              </p>
            ) : (
              <p className="ar-field__hint" id={`${ids.password}-hint`}>
                Optional. Leave this empty and the system generates a password and shows it once.
              </p>
            )}
          </div>

          <div className="ar-field">
            <label htmlFor={ids.confirm}>Confirm Password</label>
            <input
              id={ids.confirm}
              ref={confirmRef}
              type="password"
              autoComplete="new-password"
              value={confirm}
              disabled={saving}
              aria-invalid={errors.confirm ? true : undefined}
              aria-describedby={errors.confirm ? errId("confirm") : undefined}
              onChange={(e) => {
                setConfirm(e.target.value);
                clearError("confirm");
              }}
            />
            {errors.confirm ? (
              <p className="ar-field__error" id={errId("confirm")}>
                {errors.confirm}
              </p>
            ) : null}
          </div>

          <div className="ar-actions">
            <button type="submit" className="ar-pill" disabled={saving}>
              {saving ? "Saving…" : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
