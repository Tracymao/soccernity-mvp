// "Ask for a review" card on Create Profile for a user whose username an admin removed
// (B-139 part (c), Decision Log #467). Figma: Create Profile — Username Review frames, states 01 to
// 10 (desktop 6956:44591 .. 6956:46409, mobile 6956:44130 .. 6956:44382); founder-approved default
// 2026-11-04: where a frame shows data the server does not send (the removed handle, the request
// date), the clause is omitted (see usernameReviewCopy.ts).
//
// EVERYTHING COMES FROM THE SERVER. GET /users/me/username-review says which state the person is in;
// this card computes no 30-day rule, no "who may ask" rule and no deadline. It renders nothing for
// `none` (never removed, window passed with no request, or already has a username), `reinstated` (the
// onboarding routing moves a reinstated user on) and while loading or if the status cannot be read
// (the username field below still works; the server decides on submit).
//
// States shown: can_request (entry) -> form -> submitting -> sent; pending; declined (final); the
// window-passed line after a 403 username_review_window_closed; the two frame errors (could not send,
// already asked) plus two plain ones. Errors are chosen by the server's `code`, not its English.
//
// Keyboard and screen readers: the card is a labelled region; the textarea has a real label and is
// described by the counter and the note; focus goes to the textarea when the form opens and back to
// "Ask for a review" on Cancel; errors are role="alert", the sent confirmation role="status".
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  getUsernameReviewStatus,
  requestUsernameReview,
  USERNAME_REVIEW_ALREADY_REQUESTED_CODE,
  USERNAME_REVIEW_MESSAGE_MAX_LENGTH,
  USERNAME_REVIEW_NOT_AVAILABLE_CODE,
  USERNAME_REVIEW_WINDOW_CLOSED_CODE,
  UsernameReviewApiError,
  type UsernameReviewState,
} from "../../api/usernameReview";
import * as copy from "./usernameReviewCopy";
import "./UsernameReviewCard.css";

type View = "card" | "form" | "sent";

interface Props {
  accessToken: string;
  // Called when the status, re-read on window focus, stops being `pending` for any reason other than a
  // decline: the person was reinstated (they now have a username), so the page re-checks where they
  // belong and moves them on, as the onboarding routing already does.
  onReinstated: () => void;
}

function errorMessageFor(err: unknown): string {
  if (err instanceof UsernameReviewApiError) {
    if (err.code === USERNAME_REVIEW_ALREADY_REQUESTED_CODE) return copy.ERROR_ALREADY_ASKED;
    if (err.code === USERNAME_REVIEW_NOT_AVAILABLE_CODE) return copy.ERROR_NOT_AVAILABLE;
    if (err.status === 429) return copy.ERROR_TOO_MANY;
    // The 500-character limit is judged by the server after trimming; its own message names the number.
    if (err.status === 400 && err.message) return err.message;
  }
  return copy.ERROR_COULD_NOT_SEND;
}

export default function UsernameReviewCard({ accessToken, onReinstated }: Props) {
  const uid = useId();
  const [state, setState] = useState<UsernameReviewState | "loading">("loading");
  const [view, setView] = useState<View>("card");
  const [windowPassed, setWindowPassed] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const askRef = useRef<HTMLButtonElement>(null);
  const reinstatedRef = useRef(onReinstated);
  reinstatedRef.current = onReinstated;
  const stateRef = useRef(state);
  stateRef.current = state;

  const refresh = useCallback(async () => {
    try {
      const status = await getUsernameReviewStatus(accessToken);
      // Pending -> anything but pending/declined means the review ended in the person's favour.
      if (stateRef.current === "pending" && status.state !== "pending" && status.state !== "declined") {
        reinstatedRef.current();
      }
      setState(status.state);
    } catch {
      // Leave what is shown as it is; the username form below still works.
      setState((current) => (current === "loading" ? "none" : current));
    }
  }, [accessToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A person waiting on a review comes back to this tab: ask again, so a decision shows without a reload.
  useEffect(() => {
    function onFocus() {
      if (stateRef.current === "pending") void refresh();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  useEffect(() => {
    if (view === "form") messageRef.current?.focus();
  }, [view]);

  function openForm() {
    setError(null);
    setView("form");
  }

  function closeForm() {
    setError(null);
    setView("card");
    // Back to the button that opened the form (it renders again with the card).
    requestAnimationFrame(() => askRef.current?.focus());
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await requestUsernameReview(accessToken, message);
      setState("pending");
      setView("sent");
    } catch (err) {
      if (err instanceof UsernameReviewApiError && err.code === USERNAME_REVIEW_WINDOW_CLOSED_CODE) {
        setWindowPassed(true);
        setState("none");
        setView("card");
      } else {
        if (err instanceof UsernameReviewApiError && err.code === USERNAME_REVIEW_ALREADY_REQUESTED_CODE) {
          // The server says a request exists: the form stays with the frame's error, and Cancel then shows pending.
          setState("pending");
        }
        setError(errorMessageFor(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (view === "form" || (view === "sent" && state === "pending")) {
    if (view === "sent") {
      return (
        <section className="username-review" aria-labelledby={`${uid}-title`}>
          <h2 className="username-review__title" id={`${uid}-title`}>
            {copy.REQUEST_TITLE}
          </h2>
          <div className="username-review__success" role="status">
            <span className="username-review__success-bar" aria-hidden="true" />
            <div className="username-review__success-text">
              <p className="username-review__success-title">{copy.SENT_TITLE}</p>
              <p className="username-review__success-line">{copy.SENT_LINE}</p>
            </div>
          </div>
        </section>
      );
    }
    const noteId = `${uid}-note`;
    const counterId = `${uid}-counter`;
    return (
      <section className="username-review" aria-labelledby={`${uid}-title`}>
        <h2 className="username-review__title" id={`${uid}-title`}>
          {copy.FORM_TITLE}
        </h2>
        <form className="username-review__form" onSubmit={handleSubmit} noValidate>
          <div className="username-review__field">
            <label className="username-review__label" htmlFor={`${uid}-message`}>
              {copy.MESSAGE_LABEL}
            </label>
            <textarea
              id={`${uid}-message`}
              ref={messageRef}
              className="username-review__textarea"
              value={message}
              maxLength={USERNAME_REVIEW_MESSAGE_MAX_LENGTH}
              onChange={(event) => setMessage(event.target.value)}
              disabled={submitting}
              aria-describedby={`${counterId} ${noteId}`}
            />
            <p className="username-review__counter" id={counterId}>
              {message.length} / {USERNAME_REVIEW_MESSAGE_MAX_LENGTH}
            </p>
          </div>
          <p className="username-review__note" id={noteId}>
            {copy.FORM_NOTE}
          </p>
          {error && (
            <p className="username-review__error" role="alert">
              <span className="username-review__error-bar" aria-hidden="true" />
              <span>{error}</span>
            </p>
          )}
          <div className="username-review__actions">
            <button type="submit" className="username-review__button username-review__button--primary" disabled={submitting}>
              {submitting ? copy.SENDING_BUTTON : copy.SEND_BUTTON}
            </button>
            <button
              type="button"
              className="username-review__button username-review__button--quiet"
              onClick={closeForm}
              disabled={submitting}
            >
              {copy.CANCEL_BUTTON}
            </button>
          </div>
        </form>
      </section>
    );
  }

  if (windowPassed) {
    return (
      <section className="username-review" aria-labelledby={`${uid}-title`}>
        <h2 className="username-review__title" id={`${uid}-title`}>
          {copy.ENTRY_TITLE}
        </h2>
        <p className="username-review__line">{copy.WINDOW_PASSED_LINE}</p>
        <p className="username-review__line username-review__line--secondary">{copy.CHOOSE_NEW_LINE}</p>
      </section>
    );
  }

  if (state === "can_request") {
    return (
      <section className="username-review" aria-labelledby={`${uid}-title`}>
        <h2 className="username-review__title" id={`${uid}-title`}>
          {copy.ENTRY_TITLE}
        </h2>
        <p className="username-review__line">{copy.ENTRY_LINE_1}</p>
        <p className="username-review__line username-review__line--secondary">{copy.ENTRY_LINE_2}</p>
        <div className="username-review__actions">
          <button
            type="button"
            ref={askRef}
            className="username-review__button username-review__button--outline"
            onClick={openForm}
          >
            {copy.ASK_BUTTON}
          </button>
        </div>
      </section>
    );
  }

  if (state === "pending") {
    return (
      <section className="username-review" aria-labelledby={`${uid}-title`}>
        <div className="username-review__heading">
          <h2 className="username-review__title" id={`${uid}-title`}>
            {copy.REQUEST_TITLE}
          </h2>
          <span className="username-review__pill username-review__pill--outline">{copy.PENDING_PILL}</span>
        </div>
        <p className="username-review__line">{copy.PENDING_LINE_1}</p>
        <p className="username-review__line username-review__line--secondary">{copy.PENDING_LINE_2}</p>
      </section>
    );
  }

  if (state === "declined") {
    return (
      <section className="username-review" aria-labelledby={`${uid}-title`}>
        <div className="username-review__heading">
          <h2 className="username-review__title" id={`${uid}-title`}>
            {copy.DECLINED_TITLE}
          </h2>
          <span className="username-review__pill username-review__pill--neutral">{copy.DECLINED_PILL}</span>
        </div>
        <p className="username-review__line">{copy.DECLINED_LINE_1}</p>
        <p className="username-review__line username-review__line--secondary">{copy.CHOOSE_NEW_LINE}</p>
      </section>
    );
  }

  return null;
}
