// Vercel serverless entry. The Express app is stateless (all state is in
// Supabase), so Vercel can invoke it directly as the request handler. A rewrite
// in vercel.json sends every /api/* path here.
import app from '../server/app.js'

export default app
