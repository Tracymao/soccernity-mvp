// Generic placeholder rendered by every route stub in this PR (F1 --
// routing/app-shell foundation only). Each page in this directory is a
// route target for a later PR to fill in with a real, Figma-derived
// screen -- see the `owner` comment on each file for which PR that is.
//
// Do not add real UI here. This component exists so route stubs are
// visually distinguishable from a broken route during manual testing.
interface PlaceholderPageProps {
  title: string;
  owner: string;
}

export default function PlaceholderPage({ title, owner }: PlaceholderPageProps) {
  return (
    <section>
      <h1>{title}</h1>
      <p>Route stub — screen not yet built. Owned by {owner}.</p>
    </section>
  );
}
