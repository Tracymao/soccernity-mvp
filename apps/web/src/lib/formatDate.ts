// Short numeric date used for article dates (DD/MM/YYYY, en-GB). Shared by
// BlogPage.tsx and HomePage.tsx so the two always format a date the same way.
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}
