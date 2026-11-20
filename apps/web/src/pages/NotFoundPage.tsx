import { Link } from "react-router";

export default function NotFoundPage() {
  return (
    <section>
      <h1>Page not found</h1>
      <p>
        <Link to="/">Back to home</Link>
      </p>
    </section>
  );
}
