export const TAG_PATTERN: RegExp;
export function normalise(text: string): string;
export function scanFile(file: string, root: string): { file: string; text: string }[];
export function scanApps(root: string, appDirs?: string[]): { file: string; text: string }[];
export function parseManifest(markdown: string): { file: string; text: string; frame: string }[];
export function compareToManifest(
  scanned: { file: string; text: string }[],
  manifest: { file: string; text: string }[],
): { unlisted: { file: string; text: string }[]; stale: { file: string; text: string }[] };
