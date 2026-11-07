// A picture or video of a post whose author marked their media sensitive (B-061, Decision Log #472 default (d);
// Figma frames "Post Card — Sensitive Media", docs/figma-w8-messaging.md row G: G1 blurred picture, G2 blurred
// video, G3 revealed with a Hide chip, G4 media loading, G5 media failed, mobile G6 to G10).
//
//  - `post.mediaSensitive` is the AUTHOR's setting at read time and applies to every viewer, the author included
//    (adopted default, veto-able). Profile pictures, covers and Contest entries are not covered.
//  - Blurred: the media is blurred behind a "Sensitive content / Tap to view" button. The media itself is inert
//    and hidden from assistive technology while blurred (a blurred video cannot be played or focused); the button
//    has an accessible name that says the media is hidden. Tap, Enter or Space reveals it.
//  - Revealed: the media shows normally with a "Hide" chip that blurs it again. The revealed state lives in
//    component state only: it lasts for the page view, is never stored and is not shared between cards.
//  - Loading and failed states follow G4 ("Loading…") and G5 ("Couldn’t load this picture / Tap to try again").
//    They apply to sensitive media only; ordinary media keeps its existing behaviour.
import { useEffect, useRef, useState } from "react";
import type { FeedPostMedia } from "../../api/feed";
import MediaElement from "./MediaElement";
import eyeOffIcon from "../../assets/icons/sensitive-eye-off.svg";
import "./SensitiveMedia.css";

type LoadStatus = "loading" | "ready" | "failed";

function durationLabel(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

interface Props {
  kind: FeedPostMedia["kind"];
  src: string;
  playVideo?: boolean;
  /** Called when the browser cannot load the file (the author's signed link may have run out). */
  onLoadError?: () => void;
}

export default function SensitiveMedia({ kind, src, playVideo, onLoadError }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [attempt, setAttempt] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const noun = kind === "video" ? "video" : "picture";
  const blurred = !revealed;
  const coverButton = useRef<HTMLButtonElement>(null);
  const hideButton = useRef<HTMLButtonElement>(null);
  // Focus follows the person's own action: the button they pressed disappears, so the other one takes focus
  // (keyboard and screen-reader users are not dropped back to the top of the page). Never on first render.
  const moveFocus = useRef<"hide" | "cover" | null>(null);
  useEffect(() => {
    if (moveFocus.current === "hide") hideButton.current?.focus();
    if (moveFocus.current === "cover") coverButton.current?.focus();
    moveFocus.current = null;
  }, [revealed]);

  function retry() {
    setStatus("loading");
    setAttempt((n) => n + 1);
  }

  return (
    <div className="sensitive" data-sensitive-state={status === "ready" ? (revealed ? "revealed" : "blurred") : status}>
      <div
        className={`sensitive__media${blurred ? " sensitive__media--blurred" : ""}`}
        // A blurred file can't be played, focused or read out. React 19 supports the `inert` attribute.
        inert={blurred}
        aria-hidden={blurred ? true : undefined}
      >
        <MediaElement
          key={attempt}
          kind={kind}
          src={src}
          playVideo={playVideo}
          onLoaded={() => setStatus((s) => (s === "failed" ? s : "ready"))}
          onDuration={setDuration}
          onLoadError={() => {
            setStatus("failed");
            onLoadError?.();
          }}
        />
      </div>

      {status === "loading" && (
        <div className="sensitive__state" role="status">
          <span className="sensitive__state-title">Loading…</span>
        </div>
      )}

      {status === "failed" && (
        <button type="button" className="sensitive__state sensitive__state--button" onClick={retry}>
          <span className="sensitive__state-title">Couldn’t load this {noun}</span>
          <span className="sensitive__state-hint">Tap to try again</span>
        </button>
      )}

      {status === "ready" && blurred && (
        <>
          <button
            ref={coverButton}
            type="button"
            className="sensitive__cover"
            aria-label={`Sensitive ${noun} hidden. Tap to view.`}
            onClick={() => {
              moveFocus.current = "hide";
              setRevealed(true);
            }}
          >
            <img className="sensitive__cover-icon" src={eyeOffIcon} alt="" width={22} height={22} />
            <span className="sensitive__cover-title">Sensitive content</span>
            <span className="sensitive__cover-hint">Tap to view</span>
          </button>
          {kind === "video" && duration != null && (
            <span className="sensitive__duration" aria-hidden="true">
              {durationLabel(duration)}
            </span>
          )}
        </>
      )}

      {status === "ready" && revealed && (
        <button
          ref={hideButton}
          type="button"
          className="sensitive__hide"
          onClick={() => {
            moveFocus.current = "cover";
            setRevealed(false);
          }}
        >
          <img src={eyeOffIcon} alt="" width={14} height={14} />
          Hide
        </button>
      )}
    </div>
  );
}
