// Source of the /terms and /privacy pages: the draft legal copy document
// itself (docs/legal-copy-draft-tos-privacy-policy.md), read at build time by
// vite-plugins/legalCopy.ts so the live app always renders whatever version of
// that file exists at merge time. Only the Terms text, the Privacy Policy text,
// the version line and the "not approved" flag are included in the bundle; the
// rest of the draft (changelog, Part C counsel notes, dispositions) is not.
// No copy is duplicated into the app.
export {
  IS_NOT_APPROVED,
  SOURCE_VERSION,
  TERMS_MARKDOWN,
  PRIVACY_MARKDOWN,
} from "virtual:legal-copy";
