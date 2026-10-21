import type { ApplicationInput } from "./wonderjobs";

/**
 * An application as the form sent it, checked on WonderHome's server before
 * anything is forwarded: trimmed, held to its lengths, links https only, and
 * consent given. WonderJobs checks it again and is the record of it.
 */

export const APPLICATION_LIMITS = {
  name: 120,
  email: 200,
  phone: 40,
  location: 120,
  linkedinUrl: 500,
  resumeUrl: 500,
  coverNote: 4000,
} as const;

export type ApplicationField = keyof typeof APPLICATION_LIMITS | "consent";

export type ApplicationCheck = { ok: true; input: ApplicationInput } | { ok: false; field: ApplicationField; message: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && url.hostname.includes(".") && !url.username && !url.password;
  } catch {
    return false;
  }
}

type Values = Partial<Record<ApplicationField, unknown>>;

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export function checkApplication(values: Values): ApplicationCheck {
  const name = text(values.name);
  const email = text(values.email).toLowerCase();
  const phone = text(values.phone);
  const location = text(values.location);
  const linkedinUrl = text(values.linkedinUrl);
  const resumeUrl = text(values.resumeUrl);
  const coverNote = text(values.coverNote);

  const tooLong = (field: keyof typeof APPLICATION_LIMITS, value: string) => value.length > APPLICATION_LIMITS[field];

  if (!name) return { ok: false, field: "name", message: "Enter your full name." };
  if (tooLong("name", name)) return { ok: false, field: "name", message: `Keep your name under ${APPLICATION_LIMITS.name} characters.` };
  if (!email || !EMAIL.test(email) || tooLong("email", email)) return { ok: false, field: "email", message: "Enter an email address like name@example.com." };
  if (tooLong("phone", phone) || (phone && !/^[0-9+()\-.\s]{5,}$/.test(phone))) return { ok: false, field: "phone", message: "Enter a phone number with digits, spaces and + only." };
  if (tooLong("location", location)) return { ok: false, field: "location", message: `Keep your location under ${APPLICATION_LIMITS.location} characters.` };
  if (linkedinUrl && (tooLong("linkedinUrl", linkedinUrl) || !isHttpsUrl(linkedinUrl))) return { ok: false, field: "linkedinUrl", message: "Use a full link that starts with https://." };
  if (!resumeUrl) return { ok: false, field: "resumeUrl", message: "Add a link to your résumé." };
  if (tooLong("resumeUrl", resumeUrl) || !isHttpsUrl(resumeUrl)) return { ok: false, field: "resumeUrl", message: "Use a full link to your résumé that starts with https://." };
  if (tooLong("coverNote", coverNote)) return { ok: false, field: "coverNote", message: `Keep your note under ${APPLICATION_LIMITS.coverNote} characters.` };
  if (values.consent !== true) return { ok: false, field: "consent", message: "Tick the box to agree before you send your application." };

  return {
    ok: true,
    input: {
      name,
      email,
      ...(phone ? { phone } : {}),
      ...(location ? { location } : {}),
      ...(linkedinUrl ? { linkedinUrl } : {}),
      resumeUrl,
      ...(coverNote ? { coverNote } : {}),
      consent: true,
    },
  };
}
