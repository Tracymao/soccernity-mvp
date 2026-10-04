// The Bants room-list filters (Decision Log #358). One shape shared by the
// desktop filter modal, the mobile filter panel and the active-filter chip
// row, so every surface agrees on what is applied.
import type { BanterRoomFilters, BanterRoomScopeType } from "../../api/banter";

export interface BanterFilters {
  scopeType: BanterRoomScopeType | null;
  // Free-text "Tag" search (topic name, creator name, scoped club name).
  tagQuery: string;
  // ISO dates (YYYY-MM-DD) from the native date inputs, or "" when unset.
  dateFrom: string;
  dateTo: string;
  q: string;
}

export const NO_BANTER_FILTERS: BanterFilters = {
  scopeType: null,
  tagQuery: "",
  dateFrom: "",
  dateTo: "",
  q: "",
};

export const SCOPE_OPTIONS: { value: BanterRoomScopeType; label: string }[] = [
  { value: "club", label: "Club" },
  { value: "league", label: "League" },
  { value: "country", label: "Country" },
  { value: "topic", label: "Topic" },
];

export function scopeOptionLabel(scopeType: BanterRoomScopeType): string {
  return SCOPE_OPTIONS.find((o) => o.value === scopeType)?.label ?? scopeType;
}

// A date range is only valid when both ends are set in order -- the server
// rejects dateFrom > dateTo with a 400, so the form blocks it up front.
export function dateRangeError(f: Pick<BanterFilters, "dateFrom" | "dateTo">): string | null {
  if (f.dateFrom && f.dateTo && f.dateFrom > f.dateTo) return "“From” must be on or before “To”.";
  return null;
}

// Empty strings and nulls are dropped, so an unset filter never reaches the
// query string at all.
export function toRoomFilters(f: BanterFilters): BanterRoomFilters {
  return {
    ...(f.scopeType ? { scopeType: f.scopeType } : {}),
    ...(f.tagQuery ? { tagQuery: f.tagQuery } : {}),
    ...(f.dateFrom ? { dateFrom: f.dateFrom } : {}),
    ...(f.dateTo ? { dateTo: f.dateTo } : {}),
    ...(f.q ? { q: f.q } : {}),
  };
}

export function hasAnyFilter(f: BanterFilters): boolean {
  return Boolean(f.scopeType || f.tagQuery || f.dateFrom || f.dateTo || f.q);
}

function formatIsoDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function dateRangeLabel(f: Pick<BanterFilters, "dateFrom" | "dateTo">): string | null {
  if (f.dateFrom && f.dateTo) return `${formatIsoDate(f.dateFrom)} – ${formatIsoDate(f.dateTo)}`;
  if (f.dateFrom) return `From ${formatIsoDate(f.dateFrom)}`;
  if (f.dateTo) return `To ${formatIsoDate(f.dateTo)}`;
  return null;
}

export interface FilterChip {
  key: "scope" | "tag" | "date" | "q";
  label: string;
}

export function activeFilterChips(f: BanterFilters): FilterChip[] {
  const chips: FilterChip[] = [];
  if (f.scopeType) chips.push({ key: "scope", label: scopeOptionLabel(f.scopeType) });
  if (f.tagQuery) chips.push({ key: "tag", label: `“${f.tagQuery}”` });
  const date = dateRangeLabel(f);
  if (date) chips.push({ key: "date", label: date });
  if (f.q) chips.push({ key: "q", label: `“${f.q}”` });
  return chips;
}
