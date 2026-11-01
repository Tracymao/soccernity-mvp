// The "Copy Tag" chip every two-factor frame carries (Figma 6655:2 and the pass H frames:
// "Copy Tag" / [COPY PENDING LEGAL REVIEW]). Decision Log #405 / B-124, Decision Log #412 item 5.
//
// All wording on the user two-factor screens (settings flow and the sign-in code prompt)
// describes authentication and account recovery, so the whole screen is pending legal
// review. The Figma frames mark that with ONE chip per frame rather than tagging each
// sentence, and so does this component: it is the only place the literal tag appears for
// these screens, and it has one row in docs/pending-copy-manifest.md. When counsel
// approves the wording of these screens, delete this component's use and the manifest row.
export default function CopyTag() {
  return <p className="tf-copy-tag">[COPY PENDING LEGAL REVIEW]</p>;
}
