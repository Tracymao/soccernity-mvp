// Clipboard helper for the setup key and the backup codes. Returns false when the browser has no
// async clipboard (older browsers, an insecure context): the text is still on screen to type.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
