// The Bants filter controls (Figma 2459:7671 desktop modal, 5803:8876 mobile
// filter panel). Categories, Date, Tag and Search, all four applied together
// on submit. Rendered inside a dialog on desktop and as a full-screen panel
// on mobile, so the form itself stays identical across breakpoints.
import { useState, type FormEvent } from "react";
import type { BanterRoomScopeType } from "../../api/banter";
import {
  NO_BANTER_FILTERS,
  SCOPE_OPTIONS,
  dateRangeError,
  type BanterFilters,
} from "./banterFilters";
import "./BanterFilterForm.css";

interface BanterFilterFormProps {
  initial: BanterFilters;
  onApply: (next: BanterFilters) => void;
  onCancel: () => void;
}

export default function BanterFilterForm({ initial, onApply, onCancel }: BanterFilterFormProps) {
  const [draft, setDraft] = useState<BanterFilters>(initial);
  const rangeError = dateRangeError(draft);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (rangeError) return;
    onApply({ ...draft, tagQuery: draft.tagQuery.trim(), q: draft.q.trim() });
  }

  return (
    <form className="banter-filter" onSubmit={handleSubmit}>
      <fieldset className="banter-filter__group">
        <legend className="banter-filter__legend">Categories</legend>
        <div className="banter-filter__chips">
          <button
            type="button"
            aria-pressed={draft.scopeType === null}
            className={draft.scopeType === null ? "banter-filter__chip banter-filter__chip--active" : "banter-filter__chip"}
            onClick={() => setDraft((d) => ({ ...d, scopeType: null }))}
          >
            All
          </button>
          {SCOPE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={draft.scopeType === o.value}
              className={
                draft.scopeType === o.value ? "banter-filter__chip banter-filter__chip--active" : "banter-filter__chip"
              }
              onClick={() => setDraft((d) => ({ ...d, scopeType: o.value as BanterRoomScopeType }))}
            >
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="banter-filter__group">
        <legend className="banter-filter__legend">Date</legend>
        <div className="banter-filter__dates">
          <label className="banter-filter__field">
            <span>From</span>
            <input
              type="date"
              value={draft.dateFrom}
              max={draft.dateTo || undefined}
              onChange={(e) => setDraft((d) => ({ ...d, dateFrom: e.target.value }))}
            />
          </label>
          <label className="banter-filter__field">
            <span>To</span>
            <input
              type="date"
              value={draft.dateTo}
              min={draft.dateFrom || undefined}
              onChange={(e) => setDraft((d) => ({ ...d, dateTo: e.target.value }))}
            />
          </label>
        </div>
        {rangeError && (
          <p className="banter-filter__error" role="alert">
            {rangeError}
          </p>
        )}
      </fieldset>

      <fieldset className="banter-filter__group">
        <legend className="banter-filter__legend">Tag</legend>
        <input
          type="search"
          aria-label="Tag"
          placeholder="Input author name, club, etc."
          value={draft.tagQuery}
          onChange={(e) => setDraft((d) => ({ ...d, tagQuery: e.target.value }))}
        />
      </fieldset>

      <fieldset className="banter-filter__group">
        <legend className="banter-filter__legend">Search</legend>
        <input
          type="search"
          aria-label="Search rooms"
          placeholder="Search club, league, country, etc."
          value={draft.q}
          onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
        />
      </fieldset>

      <div className="banter-filter__actions">
        <button type="submit" className="banter-filter__apply" disabled={Boolean(rangeError)}>
          Search
        </button>
        <button type="button" className="banter-filter__clear" onClick={() => onApply(NO_BANTER_FILTERS)}>
          Clear all
        </button>
        <button type="button" className="banter-filter__clear" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
