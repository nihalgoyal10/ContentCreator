// Image library: the bundled aesthetic packs (shipped in public/library/) plus
// images the team uploads or scrapes from Pinterest. Uploaded/scraped files live
// in the Supabase Storage `library` bucket; their index lives in the
// `library_images` table. The browser fetches them same-origin through
// /api/library/img/:id (server streams from Storage), so the export canvas stays
// untainted.
import { dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { supabase, LIBRARY_BUCKET } from './supabase.js'
import { logger } from './log.js'

const log = logger('scrape')
const __dirname = dirname(fileURLToPath(import.meta.url))
const BUNDLED_MANIFEST = join(__dirname, '..', 'public', 'library', 'manifest.json')

function readJson(p, fb) {
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return fb }
}

// Flatten the bundled manifest into image records the UI can render. These ship
// with the app (static assets), so they stay file-based and synchronous.
function bundled() {
  const m = readJson(BUNDLED_MANIFEST, { packs: [] })
  return (m.packs || []).flatMap((pack) =>
    (pack.images || []).map((path) => ({
      id: `bundled:${path}`,
      url: `/library/${path}`,
      pack: pack.name,
      source: 'bundled',
    }))
  )
}

// Names of the bundled aesthetic packs (default selection for new projects).
export function bundledPackNames() {
  const m = readJson(BUNDLED_MANIFEST, { packs: [] })
  return (m.packs || []).map((p) => p.name)
}

const CONTENT_TYPE = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
const contentTypeFor = (path) => CONTENT_TYPE[extname(path).toLowerCase()] || 'application/octet-stream'

// Map a stored row → the shape the UI expects (served via the proxy endpoint).
function toRecord(row) {
  return {
    id: row.id,
    url: `/api/library/img/${encodeURIComponent(row.id)}`,
    pack: row.pack || 'Uploads',
    source: row.source || 'scraped',
  }
}

export async function listLibrary() {
  const { data, error } = await supabase
    .from('library_images')
    .select('id, pack, source, added_at')
    .order('added_at', { ascending: false })
  if (error) throw new Error(`library list: ${error.message}`)
  // Stored images first (newest), then the bundled packs.
  return [...(data || []).map(toRecord), ...bundled()]
}

// Group the library into packs with a few cover thumbnails each.
export async function listPacks() {
  const map = new Map()
  for (const img of await listLibrary()) {
    if (!map.has(img.pack)) map.set(img.pack, { name: img.pack, source: img.source, count: 0, covers: [] })
    const p = map.get(img.pack)
    p.count++
    if (p.covers.length < 4) p.covers.push(img.url)
  }
  return [...map.values()]
}

// Fetch one stored image's bytes for the /api/library/img/:id proxy.
export async function getImageBytes(id) {
  const { data: row } = await supabase.from('library_images').select('path').eq('id', id).maybeSingle()
  if (!row) return null
  const { data, error } = await supabase.storage.from(LIBRARY_BUCKET).download(row.path)
  if (error || !data) return null
  const buffer = Buffer.from(await data.arrayBuffer())
  return { buffer, contentType: contentTypeFor(row.path) }
}

export async function removeScraped(id) {
  const { data: row } = await supabase.from('library_images').select('path').eq('id', id).maybeSingle()
  if (row) {
    await supabase.storage.from(LIBRARY_BUCKET).remove([row.path])
    await supabase.from('library_images').delete().eq('id', id)
  }
  return listLibrary()
}

// Write one image to Storage + index it. Returns the UI record.
async function storeImage(buffer, ext, pack) {
  const id = `scraped:${Date.now()}-${Math.round(Math.random() * 1e6)}`
  const path = `${id.replace('scraped:', '')}${ext}`
  const up = await supabase.storage.from(LIBRARY_BUCKET).upload(path, buffer, {
    contentType: contentTypeFor(path),
    upsert: false,
  })
  if (up.error) throw new Error(`storage upload: ${up.error.message}`)
  const ins = await supabase.from('library_images').insert({ id, path, pack, source: 'scraped' })
  if (ins.error) {
    await supabase.storage.from(LIBRARY_BUCKET).remove([path]) // don't orphan the file
    throw new Error(`library index: ${ins.error.message}`)
  }
  return toRecord({ id, pack, source: 'scraped' })
}

// Save images the user uploaded from their device. Body items: { mimeType, data }
// where data is base64 (data-URL prefix ok). Grouped into an "Uploads" pack.
const UPLOAD_PACK = 'Uploads'
const EXT_BY_MIME = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }

export async function addUploadedImages(files) {
  const added = []
  for (const f of files || []) {
    const ext = EXT_BY_MIME[String(f?.mimeType || '').toLowerCase()]
    if (!ext) continue // accept only known image types
    const b64 = String(f.data || '').replace(/^data:[^;]+;base64,/, '')
    const buffer = Buffer.from(b64, 'base64')
    if (buffer.length < 1024) continue // skip empty/placeholder
    added.push(await storeImage(buffer, ext, UPLOAD_PACK))
  }
  log.ok(`Uploaded ${added.length} image${added.length === 1 ? '' : 's'} to "${UPLOAD_PACK}"`)
  return added
}

// ── Pinterest scraping via Apify ──────────────────────────────────────────────
// Pull image URLs out of whatever the Pinterest actor returns. Actors vary in
// shape, so try the structured path first, then scan for pinimg.com assets.
function pinImageUrls(items) {
  const list = Array.isArray(items) ? items : []

  const structured = new Set()
  for (const item of list) {
    if (item && typeof item === 'object') {
      if (item.type && item.type !== 'pin') continue
      const s = item?.media?.images
      const chosen = s?.original ?? s?.orig ?? s?.large ?? s?.medium ?? s?.small
      if (chosen?.url) structured.add(String(chosen.url).replace(/&amp;/g, '&'))
    }
  }
  if (structured.size) return [...structured]

  const blob = JSON.stringify(list)
  const matches = blob.match(/https?:\\?\/\\?\/[^"'\\\s]*pinimg\.com[^"'\\\s]*/gi) || []
  const cleaned = matches
    .map((u) => u.replace(/\\\//g, '/').replace(/&amp;/g, '&'))
    .filter((u) => /\.(jpe?g|png|webp)/i.test(u))
  const originals = cleaned.filter((u) => /\/originals\//i.test(u))
  const byName = new Map()
  for (const u of [...originals, ...cleaned]) {
    const name = u.split('/').pop()
    if (name && !byName.has(name)) byName.set(name, u)
  }
  return [...byName.values()]
}

// Pinterest's CDN 403s requests without a browser-ish User-Agent.
const IMG_FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Referer: 'https://www.pinterest.com/',
}

const APIFY = 'https://api.apify.com/v2/acts'

export async function scrapePinterest({ apiKey, actor, searches, count }) {
  if (!apiKey) throw new Error('Missing Apify API key. Add it in Settings.')
  const queries = (searches || []).map((s) => s.trim()).filter(Boolean)
  if (!queries.length) throw new Error('Enter at least one Pinterest search.')

  const actorPath = (actor || 'fatihtahta/pinterest-scraper-search').replace('/', '~')
  const limit = Math.min(Math.max(Number(count) || 40, 10), 200)
  const input = { queries, limit }
  const pack = queries.join(', ')

  log.start(`Scraping Pinterest → "${pack}" (up to ${limit})`)
  log.step(`running Apify actor ${actor || 'fatihtahta/pinterest-scraper-search'}…`)
  const res = await fetch(`${APIFY}/${actorPath}/run-sync-get-dataset-items?token=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(300_000),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    log.fail(`Apify ${res.status}`)
    throw new Error(`Apify ${res.status}: ${t.slice(0, 160)}`)
  }
  const items = await res.json()
  log.info(`actor returned ${Array.isArray(items) ? items.length : 0} item${(Array.isArray(items) ? items.length : 0) === 1 ? '' : 's'}`)
  const urls = pinImageUrls(items).slice(0, limit)
  if (!urls.length) {
    const n = Array.isArray(items) ? items.length : 0
    log.fail(`no images found (actor returned ${n} item${n === 1 ? '' : 's'})`)
    throw new Error(`No images found (actor returned ${n} item${n === 1 ? '' : 's'}). Try a different search or actor.`)
  }
  log.ok(`found ${urls.length} image${urls.length === 1 ? '' : 's'} — downloading…`)

  let added = 0
  let skipped = 0
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: IMG_FETCH_HEADERS })
      if (!r.ok) { skipped++; continue }
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length < 1024) { skipped++; continue } // skip tiny/placeholder
      const ext = (extname(new URL(url).pathname) || '.jpg').slice(0, 5)
      await storeImage(buf, ext, pack)
      added++
      if (added % 5 === 0 || added === urls.length) log.progress(added, urls.length, 'downloaded')
    } catch {
      skipped++ // skip individual failures
    }
  }
  log.ok(`Added ${added} image${added === 1 ? '' : 's'} to "${pack}"${skipped ? ` (${skipped} skipped)` : ''}`)
  return { added, found: urls.length }
}
