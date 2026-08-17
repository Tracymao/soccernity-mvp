// Concentric-ring decoration on the safeguarding-message panel of the Age
// Gate and Guardian Details Capture screens (Figma nodes 5110:6626-6629 /
// 5111:6625-6628, "Arc Ring 1-4").
//
// Figma exports these as four separate SVG files, but each is a single
// stroked circle at a different radius, all sharing one centre point --
// recreated here as one parametrised component instead of four
// near-duplicate static assets, so the stroke colour stays tied to the
// brand-green CSS variable (authThemeVars.ts) rather than the hardcoded
// `#7BB929` baked into each downloaded SVG file, per CLAUDE.md's rule that
// colours must come from tokens.
interface DecorativeRingsProps {
  className?: string;
}

// Diameters in the Figma frames are 1120/840/560/300, all sharing centre
// (560, 560) in a 1120x1120 box -- i.e. radii 560/420/280/150.
const RADII = [559, 419, 279, 149];

export default function DecorativeRings({ className }: DecorativeRingsProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 1120 1120"
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
    >
      {RADII.map((r) => (
        <circle
          key={r}
          cx="560"
          cy="560"
          r={r}
          fill="none"
          stroke="var(--signup-brand-green)"
          strokeOpacity={0.35}
          strokeWidth={2}
        />
      ))}
    </svg>
  );
}
