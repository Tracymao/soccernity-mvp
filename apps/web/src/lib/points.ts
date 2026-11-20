// Points are stored in quarter units on the server (1 point = 4 units, Decision Log #383, build
// register B-093) and `GET /leaderboard` already returns them rounded to the nearest whole point,
// a half rounding UP. This formatter is the display-side guard: whatever number reaches a screen is
// shown as a whole number, never as 0.25 / 12.5. It never ranks or sorts: ranking uses the exact
// total on the server, so two rows can show the same points and still hold different ranks.
export function roundPoints(value: number): number {
  if (!Number.isFinite(value)) return 0;
  // Math.round already rounds a .5 up for positive numbers; points are never negative.
  return Math.round(value);
}

export function formatPoints(value: number): string {
  return roundPoints(value).toLocaleString("en-GB");
}
