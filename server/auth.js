// API auth: verify the caller's Firebase ID token and check the email against
// the allowlist. Firebase ID tokens are RS256 JWTs signed by Google, verifiable
// against Google's public keys — so we need only the (public) project id, no
// service-account secret.
import { createRemoteJWKSet, jwtVerify } from 'jose'

const PROJECT = process.env.FIREBASE_PROJECT_ID || ''

// Source-of-truth allowlist (emails aren't secret). ALLOWED_EMAILS env can
// override, but only when it resolves to a non-empty list — so a missing/blank
// env var never silently disables the gate (which would let any Google account in).
const FALLBACK_ALLOWED = [
  'founders@superwavelabs.com',
  'nihal@talktorox.com',
  'shivay@talktorox.com',
  'nihalgoyal10@gmail.com',
]
const fromEnv = (process.env.ALLOWED_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)
const ALLOWED = fromEnv.length ? fromEnv : FALLBACK_ALLOWED

// Google's public keys for Firebase ID tokens (jose caches + refreshes these).
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
)

export async function requireAuth(req, res, next) {
  try {
    const authz = req.headers.authorization || ''
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : null
    if (!token) return res.status(401).json({ error: 'Authentication required' })

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT}`,
      audience: PROJECT,
    })

    const email = String(payload.email || '').toLowerCase()
    if (payload.email_verified === false) return res.status(403).json({ error: 'Email not verified' })
    if (!ALLOWED.includes(email)) {
      return res.status(403).json({ error: 'Access denied: not an authorized user' })
    }

    req.user = { email, uid: payload.user_id || payload.sub }
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}
