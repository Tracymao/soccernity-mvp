// The one minimal video player of the web app (R112): tap or click to play or pause, a thin draggable progress bar
// along the bottom edge and an always-visible mute toggle. No volume slider, full screen, speed, download or
// picture-in-picture, and no native `controls` (the browser's own chrome is not used).
//
// A real <video> element stays in the DOM where it always was, so the view-heartbeat engine (useViewHeartbeat,
// which looks for a playing <video> inside the observed element) and every "video loaded" callback work as before.
// Only one player plays at a time: starting one pauses the others.
// apps/admin keeps native controls on purpose (staff scrub through review items) and does not use this component.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent,
} from "react";
import "./VideoPlayer.css";

const SEEK_STEP_SECONDS = 5;

let currentlyPlaying: HTMLVideoElement | null = null;

export function formatClock(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

interface Props {
  src: string;
  /** The label of the <video> element itself (read by assistive technology). */
  videoLabel?: string;
  /** Class names for the <video> element (existing callers and styles key off these). */
  videoClassName?: string;
  /** Fill the width of the container (the contest voting entry). */
  fill?: boolean;
  autoPlay?: boolean;
  preload?: "none" | "metadata" | "auto";
  onLoadError?: () => void;
  onLoadedData?: () => void;
  onDuration?: (seconds: number) => void;
}

export default function VideoPlayer({
  src,
  videoLabel,
  videoClassName,
  fill,
  autoPlay,
  preload = "metadata",
  onLoadError,
  onLoadedData,
  onDuration,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [paused, setPaused] = useState(!autoPlay);
  const [muted, setMuted] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const sync = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setTime(v.currentTime || 0);
    if (Number.isFinite(v.duration)) setDuration(v.duration);
  }, []);

  // Keep the played position moving smoothly while playing.
  useEffect(() => {
    if (paused) return;
    let frame = 0;
    const tick = () => {
      sync();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [paused, sync]);

  // Autoplay: sound may be blocked by the browser, so fall back to muted and let the toggle show the state.
  useEffect(() => {
    const v = videoRef.current;
    if (!autoPlay || !v) return;
    const attempt = v.play?.();
    if (attempt && typeof attempt.catch === "function") {
      attempt.catch(() => {
        v.muted = true;
        setMuted(true);
        const retry = v.play?.();
        if (retry && typeof retry.catch === "function") retry.catch(() => setPaused(true));
      });
    }
  }, [autoPlay, src]);

  useEffect(
    () => () => {
      if (currentlyPlaying === videoRef.current) currentlyPlaying = null;
    },
    [],
  );

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused || v.ended) {
      const attempt = v.play?.();
      if (attempt && typeof attempt.catch === "function") attempt.catch(() => setPaused(true));
    } else {
      v.pause();
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const seekTo = (seconds: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(seconds)) return;
    const max = Number.isFinite(v.duration) ? v.duration : duration;
    const next = Math.min(Math.max(0, seconds), max > 0 ? max : 0);
    v.currentTime = next;
    setTime(next);
  };

  const seekFromPointer = (clientX: number) => {
    const bar = barRef.current;
    const v = videoRef.current;
    if (!bar || !v) return;
    const rect = bar.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const max = Number.isFinite(v.duration) ? v.duration : duration;
    seekTo(ratio * (max > 0 ? max : 0));
  };

  const onBarPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    seekFromPointer(event.clientX);
  };
  const onBarPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging.current) seekFromPointer(event.clientX);
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const onBarKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    const now = v?.currentTime ?? time;
    const max = v && Number.isFinite(v.duration) ? v.duration : duration;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = now + SEEK_STEP_SECONDS;
    else if (event.key === "ArrowLeft") next = now - SEEK_STEP_SECONDS;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = max;
    if (next === null) return;
    event.preventDefault();
    seekTo(next);
  };

  const percent = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;

  return (
    <div className={`vp${fill ? " vp--fill" : ""}`} data-paused={paused ? "true" : "false"}>
      <video
        ref={videoRef}
        className={`vp__video${videoClassName ? ` ${videoClassName}` : ""}`}
        src={src}
        preload={preload}
        autoPlay={autoPlay}
        playsInline
        disablePictureInPicture
        disableRemotePlayback
        controlsList="nodownload noplaybackrate nofullscreen"
        aria-label={videoLabel}
        onContextMenu={(event) => event.preventDefault()}
        onError={onLoadError}
        onLoadedData={onLoadedData}
        onLoadedMetadata={(event: SyntheticEvent<HTMLVideoElement>) => {
          const seconds = event.currentTarget.duration;
          if (Number.isFinite(seconds)) {
            setDuration(seconds);
            onDuration?.(seconds);
          }
        }}
        onDurationChange={sync}
        onTimeUpdate={sync}
        onPlay={() => {
          const v = videoRef.current;
          if (v && currentlyPlaying && currentlyPlaying !== v) currentlyPlaying.pause();
          currentlyPlaying = v;
          setPaused(false);
        }}
        onPause={() => {
          setPaused(true);
          sync();
        }}
        onEnded={() => setPaused(true)}
        onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
      />
      <button type="button" className="vp__surface" onClick={toggle} aria-label={paused ? "Play video" : "Pause video"}>
        <span className="vp__play" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="28" height="28" focusable="false">
            <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
          </svg>
        </span>
      </button>
      <button
        type="button"
        className="vp__mute"
        onClick={toggleMute}
        aria-label={muted ? "Unmute video" : "Mute video"}
        aria-pressed={muted}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" focusable="false" aria-hidden="true">
          <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" />
          {muted ? (
            <path d="M15 9.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
          ) : (
            <path
              d="M15 9a4 4 0 010 6m2.5-8.5a7.5 7.5 0 010 11"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
          )}
        </svg>
      </button>
      <div
        ref={barRef}
        className="vp__bar"
        role="slider"
        tabIndex={0}
        aria-label="Video progress"
        aria-valuemin={0}
        aria-valuemax={Math.floor(duration)}
        aria-valuenow={Math.floor(time)}
        aria-valuetext={`${formatClock(time)} of ${formatClock(duration)}`}
        onKeyDown={onBarKeyDown}
        onPointerDown={onBarPointerDown}
        onPointerMove={onBarPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="vp__track">
          <div className="vp__fill" style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  );
}
