// backend/suspected-illegal-imagery-path (B-206; founder decision 2026-11-15).
//
// WHERE a suspected-illegal-imagery filing may be made, by the uploader's country. EVERY ENTRY IS PENDING COUNSEL:
// which body Soccernity must or may file with, in which country, is a legal question this code does not answer. The
// table exists only so the filing screen can SUGGEST bodies and record which one was used; nothing here makes a
// network call, and no URL is stored because none was verified. A suggestion never restricts the admin: the filing
// route accepts any key in RECEIVING_BODY_KEYS plus 'other' (with a free-text name).
//
// Country is the uploader's country snapshot (derivedCountry, else declaredCountry, at set-aside time).

export interface ReceivingBody {
  key: string;
  label: string;
  /** ISO-3166 alpha-2 codes this body is SUGGESTED for. */
  countries: readonly string[];
  /** Always true today: nothing in this table is counsel-approved. */
  pendingCounsel: true;
}

// EU member states (the INHOPE-network national hotline is the suggestion there).
const EU_MEMBER_STATES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
] as const;

export const RECEIVING_BODIES: readonly ReceivingBody[] = [
  { key: 'iwf', label: 'Internet Watch Foundation (IWF)', countries: ['GB'], pendingCounsel: true },
  { key: 'nca', label: 'National Crime Agency (NCA)', countries: ['GB'], pendingCounsel: true },
  { key: 'ncmec', label: 'National Center for Missing & Exploited Children (NCMEC)', countries: ['US'], pendingCounsel: true },
  {
    key: 'inhope_national_hotline',
    label: 'National hotline in the INHOPE network',
    countries: EU_MEMBER_STATES,
    pendingCounsel: true,
  },
  // Nigeria: NO receiving body is named. Counsel has not identified one; an admin records 'other' with a name, or
  // records "not filed" with a reason.
];

/** 'other' is always accepted (it needs bodyOther); the keys below are the named bodies. */
export const OTHER_BODY_KEY = 'other';
export const RECEIVING_BODY_KEYS: readonly string[] = [...RECEIVING_BODIES.map((b) => b.key), OTHER_BODY_KEY];

/** Body keys suggested for an uploader's country. Unknown or missing country, and NG, give an empty list. */
export function suggestedBodyKeysFor(country: string | null | undefined): string[] {
  if (!country) return [];
  const code = country.trim().toUpperCase();
  return RECEIVING_BODIES.filter((b) => b.countries.includes(code)).map((b) => b.key);
}

export interface SuggestedBody {
  key: string;
  label: string;
  pendingCounsel: true;
}

export function suggestedBodiesFor(country: string | null | undefined): SuggestedBody[] {
  const keys = new Set(suggestedBodyKeysFor(country));
  return RECEIVING_BODIES.filter((b) => keys.has(b.key)).map((b) => ({ key: b.key, label: b.label, pendingCounsel: true }));
}
