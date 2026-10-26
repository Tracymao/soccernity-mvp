// Create Profile (build register B-081, B-194, B-215, B-216; Decision Log #367,
// #369, #371, #394 A1-A3, #403 item 17, #411 items 2 and 4, #412 items 3 and 4).
// Figma: Create Profile desktop 1498:2303 / mobile 1629:2449, and the flagged
// frames 6672:29251 / 6672:29235.
//
// ROUTING: the server's onboarding state (`nextStep: create_profile`, B-030)
// sends every account without a username here, on every login, and every
// legacy account without one is inside the incomplete-profile gate (B-027). This
// page redirects any account whose own state is something else.
//
// WHAT IT COLLECTS, all through endpoints that already exist:
//   - Profile picture (optional) and cover photo (optional): uploaded the moment
//     they are chosen (POST /users/:id/avatar | /cover), reviewed and invisible
//     to everyone else until the image check exists (#411 item 1). The Figma
//     frame draws only the picture; the cover is added here because the
//     decision (#411 item 4) says it is optional at Create Profile like the
//     picture (B-196) and Edit Profile has it; no frame draws it on this screen.
//   - Full name (prefilled, editable) and Username (required): PATCH /users/:id.
//     The server enforces the username rules (reserved words, impersonation,
//     personal data, the change cooldown) and this page shows its message
//     verbatim.
//   - Date of birth: READ-ONLY, set at the Age Gate (#367). Never editable here.
//   - Country (optional, editable, blank at first): the optional PROFILE country
//     only (#403 item 17). It is not the safeguarding country, which this page
//     never shows or sends.
//   - Bio (optional, 160) and Preferred Club (optional free text, 80, owner-only):
//     screened by the server; a flagged value is the inline "Please rephrase"
//     state with the typed text kept and no override (#394 A3, #411 item 2).
//
// Nothing here asks for a position, a school team or any other field no endpoint
// stores.
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import SignupSplitScreen from "./signup/SignupSplitScreen";
import { lightAuthThemeVars } from "./signup/authThemeVars";
import illustration from "../assets/signup/register-illustration.svg";
import { getUser, updateUser, UsersApiError, type ProfileImage, type UserProfile } from "../api/users";
import { ONBOARDING_ROUTES, routeForNextStep } from "../lib/onboarding";
import { profileCountryOptions } from "../lib/countries";
import { decodeAccessToken, getStoredAccessToken } from "../lib/session";
import ProfileImageControl from "./profile/ProfileImageControl";
import { NOT_FLAGGED, RephraseNote, flaggedFieldsFrom, type FlaggedFields } from "./profile/rephrase";
import {
  BIO_MAX_LENGTH,
  PREFERRED_CLUB_MAX_LENGTH,
  USERNAME_PATTERN,
  formatDobField,
  initialsFor,
  splitDisplayName,
} from "./profile/profileFields";
import "./signup/SignupSplitScreen.css";
import "./profile/CreateProfilePage.css";

export default function CreateProfilePage() {
  const navigate = useNavigate();
  const token = getStoredAccessToken();
  const userId = token ? decodeAccessToken(token)?.sub : undefined;

  const [redirectTo, setRedirectTo] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<UserProfile | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [country, setCountry] = useState("");
  const [bio, setBio] = useState("");
  const [preferredClub, setPreferredClub] = useState("");
  const [avatar, setAvatar] = useState<ProfileImage | null>(null);
  const [cover, setCover] = useState<ProfileImage | null>(null);
  const [flagged, setFlagged] = useState<FlaggedFields>(NOT_FLAGGED);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Fields the person has already touched. The profile read below fills a field
  // only if it is not in this set, so a slow response can never wipe what has
  // been typed (QA second run D-18).
  const touched = useRef<Set<string>>(new Set());
  const touch = (field: string) => {
    touched.current.add(field);
  };

  // Server-driven: only an account whose own state says `create_profile` may
  // use this page. A restricted-pending minor or an unverified account is sent
  // back to where they belong; an already-complete profile moves on. The same
  // read fills the form, so a person who comes back mid-way keeps what is saved.
  useEffect(() => {
    if (!token || !userId) return;
    let cancelled = false;
    getUser(token, userId)
      .then((user) => {
        if (cancelled) return;
        if (user.nextStep !== "create_profile") {
          setRedirectTo(
            user.nextStep === "none" ? ONBOARDING_ROUTES.clubPicker : routeForNextStep(user.nextStep),
          );
          return;
        }
        const name = splitDisplayName(user.displayName ?? "");
        const untouched = (field: string) => !touched.current.has(field);
        setLoaded(user);
        if (untouched("firstName")) setFirstName(name.firstName);
        if (untouched("lastName")) setLastName(name.lastName);
        if (untouched("username")) setUsername(user.username ?? "");
        if (untouched("country")) setCountry(user.profileCountry ?? "");
        if (untouched("bio")) setBio(user.bio ?? "");
        if (untouched("preferredClub")) setPreferredClub(user.preferredClub ?? "");
        if (untouched("avatar")) setAvatar(user.avatar ?? null);
        if (untouched("cover")) setCover(user.cover ?? null);
      })
      .catch(() => {
        // Leave the form usable; the server still decides on submit.
      });
    return () => {
      cancelled = true;
    };
  }, [token, userId]);

  if (!token || !userId) return <Navigate to="/login" replace />;
  if (redirectTo) return <Navigate to={redirectTo} replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token || !userId) return;
    const trimmedUsername = username.trim();
    const displayName = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (!displayName) {
      setError("Enter your full name.");
      return;
    }
    if (!USERNAME_PATTERN.test(trimmedUsername)) {
      setError("Username must be 3-30 characters: letters, numbers and underscores only.");
      return;
    }
    setError(null);
    setFlagged(NOT_FLAGGED);
    setSubmitting(true);
    try {
      await updateUser(token, userId, {
        displayName,
        username: trimmedUsername,
        profileCountry: country || null,
        bio: bio.trim() || null,
        preferredClub: preferredClub.trim() || null,
      });
      navigate(ONBOARDING_ROUTES.clubPicker);
    } catch (err) {
      const flaggedNow = flaggedFieldsFrom(err);
      if (flaggedNow) {
        // Nothing was saved; the typed text stays in the fields to be edited.
        setFlagged(flaggedNow);
      } else {
        setError(err instanceof UsersApiError ? err.message : "Couldn't save your profile. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SignupSplitScreen
      variant="light"
      themeVars={lightAuthThemeVars}
      rightPanel={<img src={illustration} alt="" className="signup-split__illustration" />}
    >
      <h1 className="signup-split__heading">Create your profile</h1>
      <p className="signup-split__subheading">Add a few details to finish setting up your profile.</p>

      <form className="signup-form create-profile" onSubmit={handleSubmit} noValidate>
        <ProfileImageControl
          kind="avatar"
          accessToken={token}
          userId={userId}
          image={avatar}
          onChange={(image) => {
            touch("avatar");
            setAvatar(image);
          }}
          initials={initialsFor(`${firstName} ${lastName}`)}
        />

        <ProfileImageControl kind="cover" accessToken={token} userId={userId} image={cover} onChange={(image) => {
            touch("cover");
            setCover(image);
          }}
        />

        <div className="signup-form__group">
          <span className="signup-form__label">
            Full Name<span className="create-profile__required">*</span>
          </span>
          <div className="signup-form__row">
            <input
              className="signup-form__input"
              value={firstName}
              onChange={(event) => {
                touch("firstName");
                setFirstName(event.target.value);
              }}
              placeholder="First Name"
              aria-label="First name"
              autoComplete="given-name"
              disabled={submitting}
            />
            <input
              className="signup-form__input"
              value={lastName}
              onChange={(event) => {
                touch("lastName");
                setLastName(event.target.value);
              }}
              placeholder="Last Name"
              aria-label="Last name"
              autoComplete="family-name"
              disabled={submitting}
            />
          </div>
        </div>

        <div className="signup-form__group">
          <label className="signup-form__label" htmlFor="create-profile-username">
            Username<span className="create-profile__required">*</span>
          </label>
          <input
            id="create-profile-username"
            className="signup-form__input"
            value={username}
            onChange={(event) => {
              touch("username");
              setUsername(event.target.value);
            }}
            placeholder="Choose a Username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            disabled={submitting}
          />
          <p className="signup-form__hint">
            3-30 letters, numbers or underscores. It is the name other people see on Soccernity, instead of your
            full name.
          </p>
        </div>

        <div className="signup-form__group">
          <label className="signup-form__label" htmlFor="create-profile-dob">
            Date of Birth
          </label>
          <input
            id="create-profile-dob"
            className="signup-form__input"
            value={loaded ? formatDobField(loaded.dateOfBirth) : ""}
            readOnly
            aria-readonly="true"
          />
          <p className="signup-form__hint">Set when you signed up and cannot be changed here. [COPY PENDING LEGAL REVIEW]</p>
        </div>

        <div className="signup-form__group">
          <label className="signup-form__label" htmlFor="create-profile-country">
            Country <span className="create-profile__optional">(Optional)</span>
          </label>
          <select
            id="create-profile-country"
            className="signup-form__select"
            value={country}
            onChange={(event) => {
              touch("country");
              setCountry(event.target.value);
            }}
            disabled={submitting}
          >
            <option value="">Select country</option>
            {profileCountryOptions().map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
              </option>
            ))}
          </select>
        </div>

        <div className="signup-form__group">
          <label className="signup-form__label" htmlFor="create-profile-bio">
            Bio <span className="create-profile__optional">(Optional)</span>
          </label>
          <textarea
            id="create-profile-bio"
            className={`signup-form__input create-profile__textarea${flagged.bio ? " profile-flagged" : ""}`}
            value={bio}
            maxLength={BIO_MAX_LENGTH}
            onChange={(event) => {
              touch("bio");
              setBio(event.target.value);
              if (flagged.bio) setFlagged((f) => ({ ...f, bio: false }));
            }}
            placeholder="Write a short bio"
            aria-invalid={flagged.bio || undefined}
            aria-describedby={flagged.bio ? "create-profile-bio-rephrase" : undefined}
            disabled={submitting}
          />
          {flagged.bio && <RephraseNote id="create-profile-bio-rephrase" />}
        </div>

        <div className="signup-form__group">
          <label className="signup-form__label" htmlFor="create-profile-club">
            Preferred Club <span className="create-profile__optional">(Optional)</span>
          </label>
          <input
            id="create-profile-club"
            className={`signup-form__input${flagged.preferredClub ? " profile-flagged" : ""}`}
            value={preferredClub}
            maxLength={PREFERRED_CLUB_MAX_LENGTH}
            onChange={(event) => {
              touch("preferredClub");
              setPreferredClub(event.target.value);
              if (flagged.preferredClub) setFlagged((f) => ({ ...f, preferredClub: false }));
            }}
            placeholder="Enter your preferred club"
            aria-invalid={flagged.preferredClub || undefined}
            aria-describedby={flagged.preferredClub ? "create-profile-club-rephrase" : undefined}
            disabled={submitting}
          />
          {flagged.preferredClub && <RephraseNote id="create-profile-club-rephrase" />}
        </div>

        {error && (
          <p className="signup-form-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="signup-button" disabled={submitting}>
          {submitting ? "Saving…" : "Continue"}
        </button>
      </form>
    </SignupSplitScreen>
  );
}
