// The admin search bar (B-114, Decision Log #463; Figma component `Admin Search Bar` 6926:35951, states Idle,
// Focused, With text, Submitting). A real form: submitting goes to /search?q=<text> and the query lives in the
// URL, so a reload, the back button and a shared link all return to the same results.
//
// States are drawn by CSS and props, not tracked twice: Idle / Focused are the input's own focus state, "With
// text" is a non-empty draft (the clear control appears), "Submitting" is the `submitting` prop the results
// page sets while its request is in flight (spinner and "Searching…" in place of the search icon and text).
import { type FormEvent, useEffect, useId, useState } from "react";
import { useNavigate } from "react-router";
import searchIcon from "../../assets/icons/search.svg";
import clearIcon from "../../assets/icons/search-clear.svg";
import "./AdminSearchBar.css";

export const SEARCH_ROUTE = "/search";
export const SEARCH_HELPER = "Email lookups need the full address, for example name@example.com.";
export const SEARCH_ENTER_HINT = "Press Enter to search.";

interface AdminSearchBarProps {
  /** The query already in the URL (the results page). The draft starts from it and follows it when it changes. */
  initialQuery?: string;
  /** A search is running (the results page sets this). */
  submitting?: boolean;
  /** Called with the trimmed text instead of navigating; the results page uses it to keep one source of truth. */
  onSubmit?: (query: string) => void;
}

export default function AdminSearchBar({ initialQuery = "", submitting = false, onSubmit }: AdminSearchBarProps) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(initialQuery);
  const helperId = useId();

  // The URL changed under us (back button, a new search from elsewhere): the bar shows what was searched.
  useEffect(() => {
    setDraft(initialQuery);
  }, [initialQuery]);

  const dirty = draft.trim() !== "" && draft.trim() !== initialQuery.trim();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = draft.trim();
    if (query === "") return;
    if (onSubmit) onSubmit(query);
    else navigate(`${SEARCH_ROUTE}?${new URLSearchParams({ q: query }).toString()}`);
  }

  return (
    <form className="admin-search" role="search" onSubmit={handleSubmit} noValidate>
      <label
        className={`admin-search__bar${submitting ? " admin-search__bar--submitting" : ""}`}
        htmlFor={`${helperId}-input`}
      >
        {submitting ? (
          <span className="admin-search__spinner" aria-hidden />
        ) : (
          <img src={searchIcon} alt="" className="admin-search__icon" />
        )}
        <input
          id={`${helperId}-input`}
          className="admin-search__input"
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Search Soccernity"
          aria-label="Search Soccernity"
          aria-describedby={helperId}
          autoComplete="off"
          spellCheck={false}
        />
        {submitting ? <span className="admin-search__status">Searching…</span> : null}
        {draft !== "" && !submitting ? (
          <button type="button" className="admin-search__clear" aria-label="Clear search" onClick={() => setDraft("")}>
            <img src={clearIcon} alt="" width={16} height={16} />
          </button>
        ) : null}
      </label>
      <p className="admin-search__helper" id={helperId}>
        {SEARCH_HELPER}
        {dirty ? ` ${SEARCH_ENTER_HINT}` : ""}
      </p>
    </form>
  );
}
