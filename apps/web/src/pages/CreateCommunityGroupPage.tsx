// Create a Community Group. Figma source: "Community Groups -- 6 Create a
// Group -- Desktop" (6454:18709) / "Mobile" (6458:18701), "Soccernity-MVP"
// (weZWWqggy9j13eX8bhFgs6), from sprint-3/community-groups-design
// (Decision Log #281). Route: /groups/new.
//
// Real data (Build Plan Sprint 3): POST /community-groups -- { name, and
// EXACTLY ONE of city / positionPlayed / careerTrack } (api/community-groups.ts).
// The DTO itself accepts "at least one" of the three, but the Figma form's
// own "Group type (required)" selector always shows exactly one value
// field at a time ("One dimension only... swaps the field below") -- this
// page mirrors that, submitting only the single selected dimension.
//
// POST /community-groups is JwtAuthGuard + GuardianConsentGuard: a
// restricted-pending minor gets a 403, surfaced with a link to
// /guardian-consent (isAwaitingConsent). A duplicate (normalized) name is
// a 409, surfaced with the server's own message. No-session -> a "log in"
// prompt, the API never called.
//
// The Figma form's "Short description (optional)" field is DELIBERATELY
// OMITTED -- CommunityGroup has no description column anywhere in
// schema.prisma (confirmed by reading the model directly), so there is no
// endpoint field to write it to. Not rendered disabled either (unlike
// ProfilePage's Bio/Location fields, which ARE planned-but-unbuilt columns
// on `User`) -- this field simply does not exist as a concept in the data
// model today, so it is left out entirely rather than implying it will
// eventually work. The "No group photo or logo" callout IS reproduced
// verbatim -- it's real, already-written copy in the Figma frame itself
// explaining an identical omission for an image field, the same Decision
// Log #58 precedent it cites.
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import {
  createCommunityGroup,
  DIMENSION_LABELS,
  CommunityGroupsApiError,
  type GroupDimension,
} from "../api/community-groups";
import { getStoredAccessToken } from "../lib/session";
import { isAwaitingConsent } from "./community-groups/errors";
import "./community-groups/CommunityGroupsPage.css";

const DIMENSION_OPTIONS: GroupDimension[] = ["city", "positionPlayed", "careerTrack"];

const VALUE_PLACEHOLDER: Record<GroupDimension, string> = {
  city: "e.g. Lagos",
  positionPlayed: "e.g. Striker",
  careerTrack: "e.g. Coaching",
};

export default function CreateCommunityGroupPage() {
  const token = getStoredAccessToken();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [dimension, setDimension] = useState<GroupDimension>("city");
  const [value, setValue] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingConsent, setAwaitingConsent] = useState(false);

  if (!token) {
    return (
      <div className="groups-status" role="status">
        Log in to create a group. <Link to="/login">Log in</Link>
      </div>
    );
  }

  const trimmedName = name.trim();
  const trimmedValue = value.trim();
  const canSubmit = trimmedName.length >= 2 && trimmedValue.length >= 1 && !submitting;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!token || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    setAwaitingConsent(false);
    try {
      const created = await createCommunityGroup(token, {
        name: trimmedName,
        [dimension]: trimmedValue,
      });
      navigate(`/groups/${created.id}`);
    } catch (err) {
      if (isAwaitingConsent(err)) {
        setAwaitingConsent(true);
      } else {
        setError(err instanceof CommunityGroupsApiError ? err.message : "Couldn't create that group.");
      }
      setSubmitting(false);
    }
  }

  return (
    <form className="groups-form" onSubmit={submit}>
      <Link to="/groups" className="groups-back">
        ← Community Groups
      </Link>

      <div className="groups-form__header">
        <h1 className="groups-form__title">Create a group</h1>
        <p className="groups-form__lede">
          Every Community Group is organised by exactly one dimension — a city, a position, or a career track. Pick
          the one that describes who the group is for.
        </p>
      </div>

      <div className="groups-form__card">
        <div className="groups-field">
          <label className="groups-field__label" htmlFor="cg-name">
            Group name
          </label>
          <input
            id="cg-name"
            className="groups-field__input"
            type="text"
            placeholder="e.g. Lagos Mainland Ballers"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="groups-field">
          <span className="groups-field__label">Group type (required)</span>
          <div className="groups-segmented" role="radiogroup" aria-label="Group type">
            {DIMENSION_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={dimension === opt}
                className={
                  dimension === opt
                    ? "groups-segmented__option groups-segmented__option--selected"
                    : "groups-segmented__option"
                }
                onClick={() => {
                  setDimension(opt);
                  setValue("");
                }}
              >
                {DIMENSION_LABELS[opt]}
              </button>
            ))}
          </div>
          <p className="groups-field__hint">
            One dimension only. Choosing Position played or Career track swaps the field below.
          </p>
        </div>

        <div className="groups-field">
          <label className="groups-field__label" htmlFor="cg-value">
            {DIMENSION_LABELS[dimension]} (required)
          </label>
          <input
            id="cg-value"
            className="groups-field__input"
            type="text"
            placeholder={VALUE_PLACEHOLDER[dimension]}
            value={value}
            maxLength={120}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>

        <div className="groups-callout">
          <p className="groups-callout__title">No group photo or logo</p>
          <p className="groups-callout__body">
            Deliberately omitted, not overlooked. Soccernity has no image-upload endpoint and no avatar/badge column
            on any entity today, so Club pages and Grassroots teams both use a monogram tile — Community Groups does
            the same. Flagged rather than silently adding an upload control (same precedent as Decision Log #58).
          </p>
        </div>

        {awaitingConsent && (
          <p className="groups-form__error" role="alert">
            Your account is awaiting guardian consent, so you can&rsquo;t create a group yet.{" "}
            <Link to="/guardian-consent">Check your consent status</Link>.
          </p>
        )}
        {error && (
          <p className="groups-form__error" role="alert">
            {error}
          </p>
        )}

        <div className="groups-form__actions">
          <Link to="/groups" className="groups-btn groups-btn--secondary">
            Cancel
          </Link>
          <button type="submit" className="groups-btn groups-btn--primary" disabled={!canSubmit}>
            {submitting ? "Creating…" : "Create group"}
          </button>
        </div>
      </div>
    </form>
  );
}
