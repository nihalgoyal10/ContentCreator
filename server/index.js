// Local entry point: start the Express app as a normal Node server. On Vercel
// the same app is exported from api/index.js as a serverless function instead.
import app from './app.js'

const PORT = process.env.PORT || 8787
const HOST = process.env.HOST || '127.0.0.1'

app.listen(PORT, HOST, () => {
  console.log(`\n  Slidesmith server → http://localhost:${PORT} (bound to ${HOST})`)
  console.log(`  State stored in Supabase (${process.env.SUPABASE_URL || 'SUPABASE_URL not set'})\n`)
})
