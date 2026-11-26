// Page loader (Decision Log #581): code-only.
// The full-screen branded wait shown while the session is restored. It uses
// the same classes as the static first paint in index.html (public/splash.css),
// so the hand-over from HTML to React does not move or flash.

interface SplashLoaderProps {
  label?: string;
}

export default function SplashLoader({ label = "Loading" }: SplashLoaderProps) {
  return (
    <div role="status" className="sn-boot">
      <img className="sn-boot__mark" src="/favicon.svg" alt="" width={64} height={64} />
      <span className="sn-boot__spinner" aria-hidden="true" />
      <span className="sn-boot__label">{label}</span>
    </div>
  );
}
