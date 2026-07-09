// Email allowlist — who is allowed to use the app after signing in with Google.
//
// The built-in list below is the source of truth (these emails aren't secret —
// they ship in the frontend bundle either way). VITE_ALLOWED_EMAILS can OVERRIDE
// it at build time, but only when it actually resolves to a non-empty list, so a
// missing/blank env var can never lock everyone out. Matching is case-insensitive.
const FALLBACK_ALLOWED = [
  'founders@superwavelabs.com',
  'nihal@talktorox.com',
  'shivay@talktorox.com',
  'nihalgoyal10@gmail.com',
];

const fromEnv = String(import.meta.env.VITE_ALLOWED_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const ALLOWED_EMAILS: string[] = fromEnv.length
  ? fromEnv
  : FALLBACK_ALLOWED.map((e) => e.toLowerCase());

export function isAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  return ALLOWED_EMAILS.includes(email.toLowerCase());
}
