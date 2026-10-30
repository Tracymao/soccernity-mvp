// Contact Us (/contact) -- B-046 / B-047, Decision Log #440, #444, #445.
//
// Figma: Contact Us Desktop Logged In 6113:14053 / Logged Out 6113:14199, Mobile Logged In 6115:14611 /
// Logged Out 6115:14684, the form-states frames from design/contact-us-states (validation, submitting,
// rate-limited, server error, success; docs/figma-contact-us-states-report.md) and the Contact Category
// Dropdown component 6130:14653 / 6130:14664. Logged in or out the page is the same form; the site Header
// already switches chrome at runtime, so there is one component for both.
//
// Wiring: POST /contact (api/contact.ts). A signed-in sender gets Name and Email prefilled from
// GET /users/:id; both stay editable, and a person who has already typed is never overwritten.
//
// Wording is as drawn, with two disclosed points:
//   * The dropdown frame draws FIVE options ("Data / Livescores Issues" is one entry); the server has six
//     (data and livescores_issues). Founder decision 2026-10-30: six, with the drawn label split into
//     "Data" and "Livescores Issues". The split wording is not in Figma (Figma follow-up).
//   * The rate-limited line is the frame's ("Each person ..."); the API's own 429 body for the per-email
//     limit says "Each email address ...". Both mean the same; this page always shows the frame's wording.
//
// The hero's photo overlay (Figma node "Intersect") sits UNDER a fully opaque navy rectangle in the frame,
// so it is not visible in any frame and is not shipped.
//
// The notice under the form is tagged [COPY PENDING LEGAL REVIEW] (docs/pending-copy-manifest.md). The
// Privacy Policy link goes to /privacy.
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { Link } from "react-router";
import {
  CONTACT_CATEGORIES,
  CONTACT_EMAIL_MAX_LENGTH,
  CONTACT_MESSAGE_MAX_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
  CONTACT_SUBJECT_MAX_LENGTH,
  ContactApiError,
  submitContactEnquiry,
  type ContactCategory,
} from "../api/contact";
import { getUser } from "../api/users";
import { useAccessToken } from "../lib/AuthContext";
import { decodeAccessToken } from "../lib/session";
import { useIsMobile } from "../layout/useIsMobile";
import chevronDown from "../assets/contact/contact-chevron-down.svg";
import "./ContactPage.css";

// Labels from the Figma "Contact Category Dropdown" (6130:14653), with the one drawn entry
// "Data / Livescores Issues" split in two (see the header comment).
const CATEGORY_LABELS: Record<ContactCategory, string> = {
  technical_issues: "Technical issues",
  editorial_complaints: "Editorial Complaints",
  data: "Data",
  livescores_issues: "Livescores Issues",
  suggestions: "Suggestions",
  enquiries_feedback: "Enquiries/Feedback",
};

const ERROR_NAME = "Enter your name.";
const ERROR_EMAIL = "Enter a valid email address.";
const ERROR_CATEGORY = "Choose a category.";
const ERROR_SUBJECT = "Enter a subject.";
const ERROR_MESSAGE = "Enter a message.";
const ALERT_RATE_LIMITED = "Each person can send a limited number of messages in an hour. You can send another later.";
const ALERT_SERVER_ERROR = "Something went wrong and your message wasn’t sent. Try again.";

// A deliberately plain check: something@something.something, no spaces. The server's @IsEmail() is the
// real rule; this only stops an obviously unfinished address (the frame's example is "adeniyi@").
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Field = "name" | "email" | "category" | "subject" | "message";
type Errors = Partial<Record<Field, string>>;
type Status = "idle" | "submitting" | "success";
type FormAlert = "rate_limited" | "server_error" | null;

export default function ContactPage() {
  const isMobile = useIsMobile();
  const token = useAccessToken();
  const sub = token ? (decodeAccessToken(token)?.sub ?? null) : null;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState<ContactCategory | "">("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<Status>("idle");
  const [formAlert, setFormAlert] = useState<FormAlert>(null);

  // What the signed-in account would prefill, kept so "Send another message" can restore it.
  const prefill = useRef<{ name: string; email: string } | null>(null);
  // Fields the person has edited themselves: the prefill never overwrites these.
  const touched = useRef<{ name: boolean; email: boolean }>({ name: false, email: false });

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLButtonElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!token || !sub) {
      prefill.current = null;
      return;
    }
    let cancelled = false;
    getUser(token, sub)
      .then((profile) => {
        if (cancelled) return;
        prefill.current = { name: profile.displayName, email: profile.email };
        if (!touched.current.name) setName(profile.displayName);
        if (!touched.current.email) setEmail(profile.email);
      })
      .catch(() => {
        /* non-fatal: the form just starts empty, as for a guest */
      });
    return () => {
      cancelled = true;
    };
  }, [token, sub]);

  const clearError = useCallback((field: Field) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  function validate(): Errors {
    const next: Errors = {};
    if (name.trim().length === 0) next.name = ERROR_NAME;
    if (!EMAIL_SHAPE.test(email.trim())) next.email = ERROR_EMAIL;
    if (category === "") next.category = ERROR_CATEGORY;
    if (subject.trim().length === 0) next.subject = ERROR_SUBJECT;
    if (message.trim().length === 0) next.message = ERROR_MESSAGE;
    return next;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (status === "submitting") return;
    setFormAlert(null);

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const order: [Field, { current: HTMLElement | null }][] = [
        ["name", nameRef],
        ["email", emailRef],
        ["category", categoryRef],
        ["subject", subjectRef],
        ["message", messageRef],
      ];
      order.find(([field]) => found[field])?.[1].current?.focus();
      return;
    }

    setStatus("submitting");
    try {
      await submitContactEnquiry(
        {
          name: name.trim(),
          email: email.trim(),
          category: category as ContactCategory,
          subject: subject.trim(),
          message: message.trim(),
        },
        token,
      );
      setStatus("success");
    } catch (err) {
      setStatus("idle");
      setFormAlert(err instanceof ContactApiError && err.status === 429 ? "rate_limited" : "server_error");
    }
  }

  function sendAnother() {
    touched.current = { name: false, email: false };
    setName(prefill.current?.name ?? "");
    setEmail(prefill.current?.email ?? "");
    setCategory("");
    setSubject("");
    setMessage("");
    setErrors({});
    setFormAlert(null);
    setStatus("idle");
  }

  const submitting = status === "submitting";

  return (
    <div className="contact-page">
      <div className="contact-page__hero">
        <h2 className="contact-page__hero-title">
          <span className="contact-page__hero-line1">Feel The Passion,</span>
          <span className="contact-page__hero-line2">Enjoy the Game.</span>
        </h2>
      </div>

      <h1 className="contact-page__title">Contact Us</h1>

      <div className="contact-page__panel">
        {status === "success" ? (
          <div className="contact-page__success" role="status">
            <span className="contact-page__success-disc" aria-hidden="true">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 12.5L10 17.5L19 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <h2 className="contact-page__success-title">Message sent</h2>
            <p className="contact-page__success-line">Thank you for getting in touch.</p>
            <button type="button" className="contact-page__button" onClick={sendAnother}>
              Send another message
            </button>
          </div>
        ) : (
          <form className="contact-page__form" onSubmit={submit} noValidate aria-label="Contact Us">
            <TextField
              id="contact-name"
              inputRef={nameRef}
              label="Name"
              placeholder="Name"
              autoComplete="name"
              maxLength={CONTACT_NAME_MAX_LENGTH}
              value={name}
              error={errors.name}
              disabled={submitting}
              onChange={(value) => {
                touched.current.name = true;
                setName(value);
                clearError("name");
              }}
            />
            <TextField
              id="contact-email"
              inputRef={emailRef}
              label="Email"
              placeholder={isMobile ? "Email Address" : "Email"}
              type="email"
              autoComplete="email"
              maxLength={CONTACT_EMAIL_MAX_LENGTH}
              value={email}
              error={errors.email}
              disabled={submitting}
              onChange={(value) => {
                touched.current.email = true;
                setEmail(value);
                clearError("email");
              }}
            />
            <CategorySelect
              buttonRef={categoryRef}
              placeholder={isMobile ? "Select Category" : "Choose a category"}
              value={category}
              error={errors.category}
              disabled={submitting}
              onChange={(value) => {
                setCategory(value);
                clearError("category");
              }}
            />
            <TextField
              id="contact-subject"
              inputRef={subjectRef}
              label="Subject"
              placeholder="Email Subject"
              maxLength={CONTACT_SUBJECT_MAX_LENGTH}
              value={subject}
              error={errors.subject}
              disabled={submitting}
              onChange={(value) => {
                setSubject(value);
                clearError("subject");
              }}
            />
            <div className="contact-page__field">
              <label className="contact-page__sr-only" htmlFor="contact-message">
                Message
              </label>
              <textarea
                id="contact-message"
                ref={messageRef}
                className={`contact-page__input contact-page__textarea${errors.message ? " contact-page__input--invalid" : ""}`}
                placeholder="Enter your message here"
                maxLength={CONTACT_MESSAGE_MAX_LENGTH}
                value={message}
                disabled={submitting}
                aria-invalid={errors.message ? true : undefined}
                aria-describedby={errors.message ? "contact-message-error" : undefined}
                onChange={(e) => {
                  setMessage(e.target.value);
                  clearError("message");
                }}
              />
              {errors.message && <FieldError id="contact-message-error" text={errors.message} />}
            </div>

            {formAlert && (
              <p className="contact-page__alert" role="alert">
                {formAlert === "rate_limited" ? ALERT_RATE_LIMITED : ALERT_SERVER_ERROR}
              </p>
            )}

            <button type="submit" className="contact-page__button" disabled={submitting} aria-busy={submitting}>
              {submitting ? "Sending…" : "Submit"}
            </button>

            <div className="contact-page__notice">
              <span className="contact-page__tag">[COPY PENDING LEGAL REVIEW]</span>
              <p className="contact-page__notice-text">
                Soccernity staff read the messages sent through this form. We keep your message for 12 months after
                the last message in the enquiry and then delete it automatically; if it raises a safeguarding concern
                or a complaint, it may be kept for longer as part of a report or case record. See our{" "}
                <Link to="/privacy">Privacy Policy</Link>.
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function FieldError({ id, text }: { id: string; text: string }) {
  // semantic/alert is the accent bar only, never a text colour (Decision Log #408 item 4).
  return (
    <p id={id} className="contact-page__error">
      {text}
    </p>
  );
}

function TextField(props: {
  id: string;
  inputRef: RefObject<HTMLInputElement | null>;
  label: string;
  placeholder: string;
  type?: string;
  autoComplete?: string;
  maxLength: number;
  value: string;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const errorId = `${props.id}-error`;
  return (
    <div className="contact-page__field">
      <label className="contact-page__sr-only" htmlFor={props.id}>
        {props.label}
      </label>
      <input
        id={props.id}
        ref={props.inputRef}
        className={`contact-page__input${props.error ? " contact-page__input--invalid" : ""}`}
        type={props.type ?? "text"}
        placeholder={props.placeholder}
        autoComplete={props.autoComplete}
        maxLength={props.maxLength}
        value={props.value}
        disabled={props.disabled}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={props.error ? errorId : undefined}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.error && <FieldError id={errorId} text={props.error} />}
    </div>
  );
}

// The Figma "Contact Category Dropdown": a closed field showing the placeholder or the chosen label, a
// chevron, and an open list of the six options. Built as a button + listbox (not a native <select>) so the
// open list matches the component; keyboard: Enter / Space / ArrowDown open, arrows move, Enter chooses,
// Escape and a click outside close.
function CategorySelect(props: {
  buttonRef: RefObject<HTMLButtonElement | null>;
  placeholder: string;
  value: ContactCategory | "";
  error?: string;
  disabled: boolean;
  onChange: (value: ContactCategory) => void;
}) {
  const listId = useId();
  const errorId = `${listId}-error`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function openList() {
    if (props.disabled) return;
    const selected = props.value ? CONTACT_CATEGORIES.indexOf(props.value) : 0;
    setActive(selected >= 0 ? selected : 0);
    setOpen(true);
  }

  function choose(index: number) {
    props.onChange(CONTACT_CATEGORIES[index]);
    setOpen(false);
    props.buttonRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + delta + CONTACT_CATEGORIES.length) % CONTACT_CATEGORIES.length);
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault();
      choose(active);
    }
  }

  return (
    <div className="contact-page__field contact-page__select" ref={wrapRef}>
      <button
        type="button"
        ref={props.buttonRef}
        className={`contact-page__input contact-page__select-button${props.error ? " contact-page__input--invalid" : ""}${
          props.value ? " contact-page__select-button--chosen" : ""
        }`}
        role="combobox"
        aria-label="Category"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={props.error ? errorId : undefined}
        disabled={props.disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span>{props.value ? CATEGORY_LABELS[props.value] : props.placeholder}</span>
        <img src={chevronDown} alt="" width={24} height={24} className="contact-page__chevron" />
      </button>
      {open && (
        <ul id={listId} role="listbox" aria-label="Category" className="contact-page__options">
          {CONTACT_CATEGORIES.map((key, index) => (
            <li
              key={key}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={props.value === key}
              className={`contact-page__option${index === active ? " contact-page__option--active" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(index)}
              onMouseEnter={() => setActive(index)}
            >
              {CATEGORY_LABELS[key]}
            </li>
          ))}
        </ul>
      )}
      {props.error && <FieldError id={errorId} text={props.error} />}
    </div>
  );
}
