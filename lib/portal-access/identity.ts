// Pure rules for owner portal sign-in identity. No I/O, so every rule here is
// unit-tested and shared by the server actions, the API routes and (as a
// written contract) the mobile app.

/** Reserved, non-routable domain for Client-ID identities. Never shown to users. */
export const CLIENT_ALIAS_DOMAIN = "client.aqarbooks.local";

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_PERSIAN = "۰۱۲۳۴۵۶۷۸۹";

export function normalizeDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (ch) => {
    const a = ARABIC_INDIC.indexOf(ch);
    return String(a >= 0 ? a : EASTERN_PERSIAN.indexOf(ch));
  });
}

/** `MB-10482`, `mb10482`, `MB 10482`, `مب` is not accepted: the prefix is Latin. */
export function parseClientId(raw: string): string | null {
  const match = /^mb[-\s]?(\d{4,9})$/i.exec(normalizeDigits(raw).trim());
  return match ? `MB-${match[1]}` : null;
}

/** The hidden Auth email behind a client number. */
export function clientIdToAlias(clientId: string): string {
  const parsed = parseClientId(clientId);
  if (!parsed) throw new Error("INVALID_CLIENT_ID");
  return `${parsed.toLowerCase()}@${CLIENT_ALIAS_DOMAIN}`;
}

export function isClientAlias(email: string): boolean {
  return email.toLowerCase().endsWith(`@${CLIENT_ALIAS_DOMAIN}`);
}

// ---------------------------------------------------------------- passwords

// No 0/O, 1/l/I: a temporary password is read off a screen or a WhatsApp
// message and typed on a phone, so look-alike glyphs are a support ticket.
const TEMP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** 12 characters from a 54-symbol alphabet (~69 bits), grouped `Ab3k-Xy7m-Qp9z`. */
export function generateTempPassword(random: (n: number) => Uint8Array = defaultRandom): string {
  const out: string[] = [];
  // Rejection sampling: 256 is not a multiple of 54, so a plain modulo would
  // make the first symbols slightly likelier.
  const limit = 256 - (256 % TEMP_ALPHABET.length);
  while (out.length < 12) {
    for (const byte of random(24)) {
      if (byte < limit && out.length < 12) out.push(TEMP_ALPHABET[byte % TEMP_ALPHABET.length]);
    }
  }
  return `${out.slice(0, 4).join("")}-${out.slice(4, 8).join("")}-${out.slice(8, 12).join("")}`;
}

function defaultRandom(n: number): Uint8Array {
  // Web Crypto, not node:crypto -- this also runs on the Workers runtime.
  return crypto.getRandomValues(new Uint8Array(n));
}

export type PasswordProblem = "too_short" | "needs_letter" | "needs_digit";

/** Same policy as the mobile app: >= 10 characters with a letter and a digit. */
export function passwordProblems(password: string): PasswordProblem[] {
  const problems: PasswordProblem[] = [];
  if (password.length < 10) problems.push("too_short");
  if (!/\p{L}/u.test(password)) problems.push("needs_letter");
  if (!/\d/.test(normalizeDigits(password))) problems.push("needs_digit");
  return problems;
}

export const isAcceptablePassword = (password: string) => passwordProblems(password).length === 0;

// ---------------------------------------------------------------- tokens

/** Activation tokens are 43 url-safe characters; accept a generous band. */
export const ACTIVATION_TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;

export function buildActivationUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/$/, "")}/activate/${token}`;
}
