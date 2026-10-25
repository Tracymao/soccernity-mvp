// Profile picture and cover photo control (build register B-215; Decision Log
// #371, #394 A2, #398 D2, #411 items 1 and 4, #412 items 2 and 3). One component
// for both pictures, used on Create Profile (optional) and Edit Profile.
// Figma: the K6 states (docs/figma-pass-k6-report.md section 5) -- avatar
// 6799:29324 to 6799:29492, cover 6800:29312 to 6800:29464 -- and the "choose"
// state on Create Profile 1498:2303 / 1629:2449.
//
// States, as drawn:
//   none        "Add a ..." choose button
//   uploading   file name, indeterminate bar, Cancel (aborts the request, so a
//               cancelled upload leaves nothing behind on the server)
//   pending     "Under review" pill: only the owner can see it
//   approved    "Approved" pill
//   rejected    "wasn't approved" with the reason when the server gives one,
//               and "Choose another"
//   error       the upload failed (type, size, no storage, network)
//   confirm     "Remove this picture?"  Remove / Keep
//
// What the server does (W5 / W6): POST /users/:id/avatar|cover takes a JPEG,
// PNG or WebP of at most 5 MB; a new upload is always `pending` and nobody but
// its owner can see it until the image check and review queue exist (#411
// item 1), so on today's backend `approved` and `rejected` are never reached
// by a real upload. They are built because the server's own status values
// include them and a reviewer's decision must have somewhere to show. The
// REASON for a rejection is not sent yet (B-214 is not built): it renders when
// present and the rejection is shown without it when absent.
//
// Cover crop (#412 item 3, B-215): the browser crops the chosen file to the
// cover slot's aspect ratio before upload (lib/imageCrop.ts). The avatar is not
// cropped (#412: "an avatar crop step" is not decided); CSS shows it as a circle.
//
// Wording (#412 item 5): a string carries the tag only when it makes a legal or
// safety promise (what is checked, who sees it). Buttons, progress and status
// labels do not.
import { useEffect, useRef, useState } from "react";
import {
  PROFILE_IMAGE_MAX_BYTES,
  PROFILE_IMAGE_TYPES,
  UsersApiError,
  deleteProfileImage,
  uploadProfileImage,
  type ProfileImage,
  type ProfileImageKind,
} from "../../api/users";
import { COVER_ASPECT_RATIO, cropToAspectRatio } from "../../lib/imageCrop";
import "./ProfileImageControl.css";

const COPY = {
  avatar: {
    noun: "picture",
    addLabel: "Add a Profile Picture (Optional)",
    replaceLabel: "Replace picture",
    removeLabel: "Remove picture",
    keepLabel: "Keep picture",
    chooseAnother: "Choose another picture",
    removeTitle: "Remove this picture?",
    removeBody: "Your profile will show a placeholder instead.",
    underReviewNote: "Only you can see this picture until it has been checked. [COPY PENDING LEGAL REVIEW]",
    rejectedTitle: "This picture wasn’t approved. [COPY PENDING LEGAL REVIEW]",
    approvedNote: "This picture is visible on your profile. [COPY PENDING LEGAL REVIEW]",
  },
  cover: {
    noun: "cover photo",
    addLabel: "Add a Cover Photo (Optional)",
    replaceLabel: "Replace cover photo",
    removeLabel: "Remove cover photo",
    keepLabel: "Keep cover photo",
    chooseAnother: "Choose another cover photo",
    removeTitle: "Remove this cover photo?",
    removeBody: "Your profile will show the default cover instead.",
    underReviewNote: "Only you can see this cover photo until it has been checked. [COPY PENDING LEGAL REVIEW]",
    rejectedTitle: "This cover photo wasn’t approved. [COPY PENDING LEGAL REVIEW]",
    approvedNote: "This cover photo is visible on your profile. [COPY PENDING LEGAL REVIEW]",
  },
} as const;

// Shown under the picture on Create Profile (Figma 6672:29233) and repeated in
// every avatar state frame; the cover has its own sentence.
const CHECKED_NOTE = {
  avatar: "Pictures are checked automatically before they appear on your profile. [COPY PENDING LEGAL REVIEW]",
  cover: "Cover photos are checked automatically before they appear on your profile. [COPY PENDING LEGAL REVIEW]",
} as const;

type Phase = "idle" | "uploading" | "error" | "confirm-remove";

const ERROR_FALLBACK =
  "We couldn’t upload that picture. Use a JPEG, PNG or WebP file under 5 MB and try again.";

interface Props {
  kind: ProfileImageKind;
  accessToken: string;
  userId: string;
  /** The image already on the account, or null. */
  image: ProfileImage | null;
  onChange?: (image: ProfileImage | null) => void;
  /** Initials shown in the empty avatar circle. */
  initials?: string;
}

export default function ProfileImageControl({ kind, accessToken, userId, image, onChange, initials }: Props) {
  const copy = COPY[kind];
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [current, setCurrent] = useState<ProfileImage | null>(image);
  const [phase, setPhase] = useState<Phase>("idle");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    setCurrent(image);
  }, [image]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function update(next: ProfileImage | null) {
    setCurrent(next);
    onChange?.(next);
  }

  function choose() {
    setError(null);
    inputRef.current?.click();
  }

  async function handleFile(file: File | undefined) {
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    if (!(PROFILE_IMAGE_TYPES as readonly string[]).includes(file.type) || file.size > PROFILE_IMAGE_MAX_BYTES) {
      setPhase("error");
      setError(ERROR_FALLBACK);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setFileName(file.name);
    setError(null);
    setPhase("uploading");
    try {
      const body = kind === "cover" ? await cropToAspectRatio(file, COVER_ASPECT_RATIO) : file;
      const uploaded = await uploadProfileImage(accessToken, userId, kind, body, file.name, controller.signal);
      // A new upload clears any reason shown for the previous one (#412 item 2).
      update(uploaded);
      setPhase("idle");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setPhase("idle");
        return;
      }
      setPhase("error");
      setError(err instanceof UsersApiError && err.message ? err.message : ERROR_FALLBACK);
    } finally {
      abortRef.current = null;
    }
  }

  function cancelUpload() {
    abortRef.current?.abort();
  }

  async function confirmRemove() {
    setRemoving(true);
    setError(null);
    try {
      await deleteProfileImage(accessToken, userId, kind);
      update(null);
      setPhase("idle");
    } catch (err) {
      setPhase("error");
      setError(err instanceof UsersApiError && err.message ? err.message : `Couldn’t remove that ${copy.noun}.`);
    } finally {
      setRemoving(false);
    }
  }

  const preview = current ? (
    <img className="profile-image__preview" src={current.url} alt="" />
  ) : null;

  return (
    <div className={`profile-image profile-image--${kind}`} data-testid={`profile-image-${kind}`}>
      <p className="profile-image__label">{copy.addLabel}</p>

      <div className="profile-image__row">
        <div className="profile-image__frame" aria-hidden="true">
          {preview ?? (
            <span className="profile-image__placeholder">{kind === "avatar" ? (initials ?? "") : ""}</span>
          )}
        </div>

        <div className="profile-image__side">
          {phase === "uploading" && (
            <>
              <p className="profile-image__filename">{fileName}</p>
              <div className="profile-image__bar" role="progressbar" aria-label={`Uploading ${copy.noun}`}>
                <span className="profile-image__bar-fill" />
              </div>
              <button type="button" className="profile-image__button" onClick={cancelUpload}>
                Cancel
              </button>
            </>
          )}

          {phase === "confirm-remove" && (
            <>
              <p className="profile-image__title">{copy.removeTitle}</p>
              <p className="profile-image__note">{copy.removeBody}</p>
              <div className="profile-image__actions">
                <button
                  type="button"
                  className="profile-image__button profile-image__button--primary"
                  onClick={confirmRemove}
                  disabled={removing}
                >
                  {removing ? "Removing…" : copy.removeLabel}
                </button>
                <button
                  type="button"
                  className="profile-image__button"
                  onClick={() => setPhase("idle")}
                  disabled={removing}
                >
                  {copy.keepLabel}
                </button>
              </div>
            </>
          )}

          {phase === "error" && (
            <>
              <p className="profile-image__alert" role="alert">
                {error ?? ERROR_FALLBACK}
              </p>
              <button type="button" className="profile-image__button" onClick={choose}>
                Try again
              </button>
            </>
          )}

          {phase === "idle" && !current && (
            <>
              <button type="button" className="profile-image__button profile-image__button--primary" onClick={choose}>
                {kind === "avatar" ? "Choose a picture" : "Choose a cover photo"}
              </button>
              <p className="profile-image__note">{CHECKED_NOTE[kind]}</p>
            </>
          )}

          {phase === "idle" && current && current.status === "pending" && (
            <>
              <span className="profile-image__pill">Under review</span>
              <p className="profile-image__note">{copy.underReviewNote}</p>
              <ReplaceRemove copy={copy} onReplace={choose} onRemove={() => setPhase("confirm-remove")} />
            </>
          )}

          {phase === "idle" && current && current.status === "approved" && (
            <>
              <span className="profile-image__pill profile-image__pill--approved">Approved</span>
              <p className="profile-image__note">{copy.approvedNote}</p>
              <ReplaceRemove copy={copy} onReplace={choose} onRemove={() => setPhase("confirm-remove")} />
            </>
          )}

          {phase === "idle" && current && current.status === "rejected" && (
            <>
              <p className="profile-image__alert" role="alert">
                {copy.rejectedTitle}
              </p>
              {current.reason ? (
                <p className="profile-image__note">Reason: {current.reason}</p>
              ) : null}
              <button type="button" className="profile-image__button" onClick={choose}>
                {copy.chooseAnother}
              </button>
            </>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={PROFILE_IMAGE_TYPES.join(",")}
        className="profile-image__input"
        data-testid={`profile-image-${kind}-input`}
        aria-label={copy.addLabel}
        onChange={(event) => void handleFile(event.target.files?.[0])}
        hidden
      />
    </div>
  );
}

function ReplaceRemove({
  copy,
  onReplace,
  onRemove,
}: {
  copy: (typeof COPY)[ProfileImageKind];
  onReplace: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="profile-image__actions">
      <button type="button" className="profile-image__button" onClick={onReplace}>
        {copy.replaceLabel}
      </button>
      <button type="button" className="profile-image__button" onClick={onRemove}>
        {copy.removeLabel}
      </button>
    </div>
  );
}
