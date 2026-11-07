// Kickoff-alert control -- build-register B-070, Decision Log #472.
// Figma: component set "Kickoff Alert Button" (6991:57977), states Off / On / Loading / Error /
// Started, styles Icon (match card, 36px) and Labelled (match details header, 40px); frames
// C1 6992:58498 / C2 6992:59734 (match card, desktop / mobile) and C3 6992:59845 / C4 6992:61086
// (match details header). Bell glyphs are the Figma assets in assets/kickoff-alert/.
//
// What it talks to: PUT / DELETE /sports/matches/:id/subscription (api/sports.ts setKickoffAlert).
// The initial On/Off comes from the per-caller `kickoffAlert` flag the three list/detail reads now
// carry (those reads send the access token when a session exists), so the state survives a refresh.
//
// Who sees it: a signed-in person, for a match that has not started. A logged-out visitor gets NO
// control (adopted default, B-070; the frames do not draw it and the Figma note leaves it open) --
// the callers decide that, this file never renders for a signed-out visitor.
//
// States: off -> (click) loading -> on, and back. A failed save shows Error: the control reads
// "Try again" and a line under it says "Couldn't update the alert. Try again."; the next click
// repeats the SAME change. A match that is live or finished (or whose kickoff has passed), or a
// 409 `match_already_started` from the server, shows Started: disabled "Match started".
// No colour outside the brand tokens: the Error border/line uses semantic/alert (#408 item 4,
// error callouts only); the white label on the navy "On" pill is plain #fff (apps/web has no
// text-on-navy token, same disclosed exception as accountActions.css).
import { useEffect, useRef, useState } from "react";
import { MATCH_ALREADY_STARTED_CODE, SportsApiError, setKickoffAlert } from "../../api/sports";
import bellIcon from "../../assets/kickoff-alert/bell.svg";
import bellOnIcon from "../../assets/kickoff-alert/bell-on.svg";
import bellOffIcon from "../../assets/kickoff-alert/bell-off.svg";
import spinIcon from "../../assets/kickoff-alert/spin.svg";
import "./KickoffAlertButton.css";

export type KickoffAlertState = "off" | "on" | "loading" | "error" | "started";
export type KickoffAlertStyle = "icon" | "labelled";

const LABELS: Record<KickoffAlertState, string> = {
  off: "Alert me at kickoff",
  on: "Alert on",
  loading: "Saving…",
  error: "Try again",
  started: "Match started",
};

// The Figma frame draws a curly apostrophe.
export const KICKOFF_ALERT_ERROR_TEXT = "Couldn’t update the alert. Try again.";

type SavePhase = "idle" | "saving" | "error";

export interface KickoffAlertController {
  state: KickoffAlertState;
  toggle: () => void;
}

export function useKickoffAlert(options: {
  matchId: string;
  /** The server's `kickoffAlert` flag for the signed-in caller. */
  initialOn: boolean;
  /** The match is live, finished or past its kickoff time. */
  started: boolean;
}): KickoffAlertController {
  const { matchId, initialOn, started } = options;
  // What this visit has saved, over the server's flag; dropped when a fresh read brings a new flag.
  const [saved, setSaved] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<SavePhase>("idle");
  const [startedByServer, setStartedByServer] = useState(false);
  // The change a failed save was trying to make, so "Try again" repeats it.
  const intended = useRef<boolean | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    setSaved(null);
  }, [initialOn]);

  const on = saved ?? initialOn;
  const isStarted = started || startedByServer;

  let state: KickoffAlertState;
  if (isStarted) state = "started";
  else if (phase === "saving") state = "loading";
  else if (phase === "error") state = "error";
  else state = on ? "on" : "off";

  function toggle() {
    if (isStarted || phase === "saving") return;
    const target = phase === "error" && intended.current !== null ? intended.current : !on;
    intended.current = target;
    setPhase("saving");
    setKickoffAlert(matchId, target)
      .then((subscribed) => {
        if (!mounted.current) return;
        setSaved(subscribed);
        setPhase("idle");
      })
      .catch((err: unknown) => {
        if (!mounted.current) return;
        if (err instanceof SportsApiError && err.code === MATCH_ALREADY_STARTED_CODE) {
          setStartedByServer(true);
          setPhase("idle");
          return;
        }
        setPhase("error");
      });
  }

  return { state, toggle };
}

const GLYPH: Record<KickoffAlertState, string> = {
  off: bellIcon,
  on: bellOnIcon,
  loading: spinIcon,
  error: bellIcon,
  started: bellOffIcon,
};

export function KickoffAlertButton({
  alert,
  variant,
}: {
  alert: KickoffAlertController;
  variant: KickoffAlertStyle;
}) {
  const { state } = alert;
  const label = LABELS[state];
  const classes = ["ka", `ka--${variant}`, `ka--${state}`].join(" ");
  return (
    <button
      type="button"
      className={classes}
      aria-label={label}
      // Off and On are a toggle; Loading, Error and Started are not.
      aria-pressed={state === "off" || state === "on" ? state === "on" : undefined}
      aria-busy={state === "loading" ? true : undefined}
      // Loading stays focusable (aria-disabled) so focus is not dropped mid-save.
      aria-disabled={state === "loading" ? true : undefined}
      disabled={state === "started"}
      onClick={alert.toggle}
    >
      <img
        className={state === "loading" ? "ka__glyph ka__glyph--spin" : "ka__glyph"}
        src={GLYPH[state]}
        alt=""
        aria-hidden="true"
      />
      {variant === "labelled" && <span className="ka__label">{label}</span>}
    </button>
  );
}

export function KickoffAlertError({ alert, className }: { alert: KickoffAlertController; className?: string }) {
  if (alert.state !== "error") return null;
  return (
    <p className={className ? `ka-error ${className}` : "ka-error"} role="alert">
      {KICKOFF_ALERT_ERROR_TEXT}
    </p>
  );
}
