// Slidesmith API. Holds the team's keys, runs Claude generation, proxies
// post-bridge, and serves the built UI in production. State lives in Supabase
// (see store.js / library.js), so this app is stateless and runs equally as a
// local Node process (server/index.js) or a Vercel serverless function
// (api/index.js). In dev, Vite proxies /api here.
import express from 'express'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getConfig,
  saveGlobal,
  getActiveProject,
  createProject,
  updateProject,
  deleteProject,
  setActiveProject,
  getQueue,
  setQueue,
  addToQueue,
  removeFromQueue,
} from './store.js'
import { listAccounts, listPosts, listAnalytics, syncAnalytics, uploadMedia, createPost } from './postbridge.js'
import { generateSlideshows } from './generate.js'
import { listModels, validateKey } from './openrouter.js'
import { listLibrary, listPacks, scrapePinterest, removeScraped, getImageBytes, addUploadedImages } from './library.js'
import { requireAuth } from './auth.js'
import { logger } from './log.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const schedLog = logger('schedule')
const genLog = logger('generate')

const app = express()
app.use(express.json({ limit: '50mb' })) // base64 slide images can be large

// DNS-rebinding guard (local only): a malicious website can point its own domain
// at 127.0.0.1 and read API responses from a visitor's browser. Irrelevant on a
// hosted deploy (Vercel), where the Host is the public domain — skip it there.
if (!process.env.VERCEL) {
  const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', process.env.HOST].filter(Boolean))
  app.use((req, res, next) => {
    const host = String(req.headers.host || '').replace(/:\d+$/, '')
    if (!ALLOWED_HOSTS.has(host)) return res.status(403).json({ error: `Forbidden host: ${host}` })
    next()
  })
}

// Auth gate: every /api/* call needs a valid Firebase token + allowlisted email.
// The image proxy is exempt — <img> tags can't send an Authorization header, and
// background images aren't sensitive.
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next()
  if (req.method === 'GET' && req.path.startsWith('/api/library/img/')) return next()
  return requireAuth(req, res, next)
})

// Wrap async handlers so thrown errors become clean 500 JSON instead of crashes.
const h = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(e)
  res.status(500).json({ error: e.message || String(e) })
})

// ── Config ──────────────────────────────────────────────────────────────────
app.get('/api/config', h(async (_req, res) => res.json(await getConfig())))
// Global settings only: keys + model. Project data goes through /api/projects.
app.put('/api/config', h(async (req, res) => res.json(await saveGlobal(req.body || {}))))

// ── Projects (each = a Brain + default post-bridge accounts) ──────────────────
app.post('/api/projects', h(async (req, res) => res.json(await createProject(req.body?.name))))
app.put('/api/projects/:id', h(async (req, res) => res.json(await updateProject(req.params.id, req.body || {}))))
app.delete('/api/projects/:id', h(async (req, res) => res.json(await deleteProject(req.params.id))))
app.post('/api/projects/:id/activate', h(async (req, res) => res.json(await setActiveProject(req.params.id))))

// Validate that the saved keys actually work, so Settings can show a green check.
app.post('/api/config/test', h(async (_req, res) => {
  const { keys } = await getConfig()
  const result = { postbridge: false, openrouter: false, apify: false, errors: {} }
  if (keys.postbridge) {
    try { await listAccounts(keys.postbridge); result.postbridge = true }
    catch (e) { result.errors.postbridge = e.message }
  }
  if (keys.openrouter) {
    try { await validateKey(keys.openrouter); result.openrouter = true }
    catch (e) { result.errors.openrouter = e.message }
  }
  if (keys.apify) {
    try {
      const r = await fetch(`https://api.apify.com/v2/users/me?token=${keys.apify}`)
      if (!r.ok) throw new Error(`invalid key (${r.status})`)
      result.apify = true
    } catch (e) { result.errors.apify = e.message }
  }
  res.json(result)
}))

// Public model catalog for the Settings dropdown.
app.get('/api/models', h(async (_req, res) => res.json(await listModels())))

// ── Queue (generated drafts for the active project, before post-bridge) ───────
app.get('/api/queue', h(async (_req, res) => {
  const project = await getActiveProject()
  res.json(await getQueue(project.id))
}))

app.post('/api/generate', h(async (req, res) => {
  const { keys, model } = await getConfig()
  const project = await getActiveProject()
  const count = Math.min(Math.max(Math.round(Number(req.body?.count) || 4), 1), 100)
  const slideshows = await generateSlideshows({ apiKey: keys.openrouter, model, brain: project.brain, count })

  // Auto-assign background images. A per-batch `packs` override (from the
  // Generate modal) wins; otherwise fall back to the project's saved packs.
  // Empty selection → slides keep their gradients.
  const packs = Array.isArray(req.body?.packs) ? req.body.packs : project.imagePacks || []
  const pool = packs.length ? (await listLibrary()).filter((i) => packs.includes(i.pack)) : []
  if (pool.length) {
    genLog.step(`assigning backgrounds from ${packs.length} pack${packs.length === 1 ? '' : 's'} (${pool.length} images)`)
    for (const show of slideshows) {
      const used = new Set()
      for (const slide of show.slides) {
        // Prefer an unused image within this slideshow for visual variety.
        const fresh = pool.filter((i) => !used.has(i.url))
        const pick = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length || pool.length))]
        slide.imageUrl = pick.url
        used.add(pick.url)
      }
    }
  }

  await addToQueue(project.id, slideshows)
  res.json(slideshows)
}))

app.delete('/api/queue/:id', h(async (req, res) => {
  const project = await getActiveProject()
  res.json(await removeFromQueue(project.id, req.params.id))
}))

// Edit a queued slideshow: caption, hashtags, hook, ratio, and/or per-slide text+image.
app.put('/api/queue/:id', h(async (req, res) => {
  const pid = (await getActiveProject()).id
  const patch = req.body || {}
  const allowed = ['slides', 'caption', 'hashtags', 'hook', 'ratio']
  const next = (await getQueue(pid)).map((s) => {
    if (s.id !== req.params.id) return s
    const merged = { ...s }
    for (const k of allowed) if (patch[k] !== undefined) merged[k] = patch[k]
    return merged
  })
  res.json(await setQueue(pid, next))
}))

// ── Image library (bundled aesthetic packs + uploads + Pinterest scrapes) ─────
app.get('/api/library', h(async (_req, res) => res.json(await listLibrary())))
app.get('/api/library/packs', h(async (_req, res) => res.json(await listPacks())))

app.post('/api/library/scrape', h(async (req, res) => {
  const { keys, pinterestActor } = await getConfig()
  const { searches, count } = req.body || {}
  res.json(await scrapePinterest({ apiKey: keys.apify, actor: pinterestActor, searches, count }))
}))

// Save images uploaded from the user's device. Body: { files: [{ mimeType, data }] }.
app.post('/api/library/upload', h(async (req, res) => {
  const { files } = req.body || {}
  if (!files?.length) throw new Error('No files to upload.')
  const added = await addUploadedImages(files)
  if (!added.length) throw new Error('No valid images uploaded (JPG, PNG, or WebP only).')
  res.json(added)
}))

app.delete('/api/library/:id', h(async (req, res) => res.json(await removeScraped(req.params.id))))

// Stream a stored image from Supabase Storage (same-origin → canvas stays clean).
app.get('/api/library/img/:id', h(async (req, res) => {
  const img = await getImageBytes(req.params.id)
  if (!img) return res.status(404).end()
  res.set('Content-Type', img.contentType)
  res.set('Cache-Control', 'public, max-age=31536000, immutable')
  res.send(img.buffer)
}))

// ── post-bridge ───────────────────────────────────────────────────────────────
app.get('/api/accounts', h(async (_req, res) => {
  const { keys } = await getConfig()
  res.json(await listAccounts(keys.postbridge))
}))

app.get('/api/posts', h(async (_req, res) => {
  const { keys } = await getConfig()
  res.json(await listPosts(keys.postbridge))
}))

app.get('/api/results', h(async (_req, res) => {
  const { keys } = await getConfig()
  res.json(await listAnalytics(keys.postbridge))
}))

// Pull fresh metrics from the platforms, then hand back the updated analytics.
app.post('/api/results/sync', h(async (_req, res) => {
  const { keys } = await getConfig()
  try { await syncAnalytics(keys.postbridge) } catch (e) { console.warn('[results] sync skipped:', e.message) }
  res.json(await listAnalytics(keys.postbridge))
}))

// Schedule a slideshow: upload each rendered slide image to post-bridge, then
// create the post. `slides` are data URLs (PNG) rendered in the browser.
app.post('/api/schedule', h(async (req, res) => {
  const { keys } = await getConfig()
  const { id, caption, slides, socialAccounts, scheduledAt, mode } = req.body || {}
  if (!socialAccounts?.length) throw new Error('Pick at least one social account.')
  if (!slides?.length) throw new Error('No slide images to upload.')

  // Guard: TikTok posting is disabled. listAccounts already excludes TikTok, so
  // restrict the request to accounts that survive that filter.
  const allowedIds = new Set((await listAccounts(keys.postbridge)).map((a) => a.id))
  const targets = socialAccounts.filter((accId) => allowedIds.has(accId))
  if (!targets.length) throw new Error('Pick at least one enabled social account (TikTok posting is disabled).')

  const when = mode === 'schedule' ? (scheduledAt ? `scheduled for ${scheduledAt}` : 'scheduled') : 'draft'
  schedLog.start(`Posting ${id || 'slideshow'} → ${when} · ${targets.length} account${targets.length === 1 ? '' : 's'}`)

  let done = 0
  const mediaIds = await Promise.all(
    slides.map(async (slide, i) => {
      const buffer = Buffer.from(String(slide).replace(/^data:image\/\w+;base64,/, ''), 'base64')
      const mediaId = await uploadMedia(keys.postbridge, {
        buffer,
        mimeType: 'image/png',
        name: `${id || 'slide'}-${i + 1}.png`,
      })
      schedLog.progress(++done, slides.length, 'slides uploaded')
      return mediaId
    })
  )

  schedLog.step(`creating post on post-bridge…`)
  const post = await createPost(keys.postbridge, {
    caption,
    mediaIds,
    socialAccounts: targets,
    scheduledAt: mode === 'schedule' ? scheduledAt : null,
    isDraft: mode !== 'schedule',
  })

  if (id) await removeFromQueue((await getActiveProject()).id, id)
  schedLog.ok(`Done — ${mode === 'schedule' ? 'scheduled' : 'saved as draft'}`)
  res.json(post)
}))

// ── Static (production / `npm start`; skipped on Vercel where the CDN serves dist) ──
const dist = join(__dirname, '..', 'dist')
if (existsSync(dist)) {
  app.use(express.static(dist))
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next()
    res.sendFile(join(dist, 'index.html'))
  })
}

export default app
