// Email allowlist — who is allowed to use the app after signing in with Google.
//
// Configure via VITE_ALLOWED_EMAILS in .env (comma-separated); if that's unset,
// the built-in FALLBACK list below is used. Matching is case-insensitive.
//
// NOTE: this gates the UI only. The local server's /api/* routes are unprotected
// but bound to 127.0.0.1 (loopback), so only this machine can reach them. If you
// ever expose the server on a network, add server-side token verification too.
const FALLBACK_ALLOWED = [
  'founders@superwavelabs.com',
];

export const ALLOWED_EMAILS: string[] = (
  import.meta.env.VITE_ALLOWED_EMAILS
    ? String(import.meta.env.VITE_ALLOWED_EMAILS).split(',')
    : FALLBACK_ALLOWED
)
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  return ALLOWED_EMAILS.includes(email.toLowerCase());
}
