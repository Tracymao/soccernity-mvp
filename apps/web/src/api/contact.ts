// Contact Us client -- services/api POST /contact (B-046, Decision Log #440/#445).
//
// A public route: OptionalJwtAuthGuard on the server, so a guest and a signed-in sender both work. The
// Authorization header is sent ONLY when a session exists (the same Bearer convention every other authed
// call in this app uses), which is what lets the server link a signed-in sender's enquiry to their account.
// Nothing else is sent: the DTO takes name, email, category, subject and message and the global
// ValidationPipe rejects any other key.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

// The stored values (services/api contact.constants.ts CONTACT_CATEGORIES), in the order the Figma
// "Contact Category Dropdown" draws them. The six keys are the server's; the labels are the dropdown's.
export const CONTACT_CATEGORIES = [
  "technical_issues",
  "editorial_complaints",
  "data",
  "livescores_issues",
  "suggestions",
  "enquiries_feedback",
] as const;
export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

// Field limits (contact.constants.ts). Used as maxLength on the inputs so a person cannot type past what
// the endpoint accepts.
export const CONTACT_NAME_MAX_LENGTH = 200;
export const CONTACT_EMAIL_MAX_LENGTH = 254;
export const CONTACT_SUBJECT_MAX_LENGTH = 200;
export const CONTACT_MESSAGE_MAX_LENGTH = 3000;

export interface ContactEnquiryPayload {
  name: string;
  email: string;
  category: ContactCategory;
  subject: string;
  message: string;
}

export class ContactApiError extends Error {
  readonly status?: number;

  constructor(message: string, options?: { status?: number }) {
    super(message);
    this.name = "ContactApiError";
    this.status = options?.status;
  }
}

// POST /contact -> 201 { received: true }. The caller decides what each status looks like on screen: the
// server's own message text is deliberately not surfaced (the page draws its own wording for the two states
// the design has, rate-limited and a generic failure).
export async function submitContactEnquiry(
  payload: ContactEnquiryPayload,
  accessToken: string | null,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/contact`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new ContactApiError("Couldn't reach the Soccernity server.");
  }
  if (!response.ok) {
    throw new ContactApiError(`Couldn't send that message (${response.status}).`, { status: response.status });
  }
}
