// Thin client for the post-bridge API (https://www.post-bridge.com).
// post-bridge handles media hosting, scheduling, multi-platform publishing,
// and analytics — so Slidesmith needs no storage or posting integrations of
// its own. Auth is a Bearer token the user pastes into Settings.
const BASE = 'https://api.post-bridge.com'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function authHeaders(token) {
  if (!token) throw new Error('Missing post-bridge API key. Add it in Settings.')
  return { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

// post-bridge enforces a global API rate limit (429 "API rate limit exceeded").
// Bulk scheduling fires lots of calls (create-upload-url per slide + a post per
// slideshow), so we funnel EVERY API call through a single serial queue with a
// small gap between calls. This trades a little speed for not getting throttled.
let pbChain = Promise.resolve()
const PB_MIN_GAP_MS = 350 // ~2.8 req/s

function enqueue(fn) {
  const result = pbChain.then(fn)
  // Keep the chain alive whether fn resolves or rejects, and always space the
  // NEXT call by PB_MIN_GAP_MS.
  pbChain = result.then(() => sleep(PB_MIN_GAP_MS), () => sleep(PB_MIN_GAP_MS))
  return result
}

async function pbFetch(token, path, init) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(token), ...(init.headers || {}) },
  })
  const text = await res.text()
  let body
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { res, body, text }
}

async function pb(token, path, init = {}) {
  const MAX_ATTEMPTS = 5
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { res, body, text } = await enqueue(() => pbFetch(token, path, init))
    // Rate limited — wait (honouring Retry-After if present) and try again.
    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(res.headers.get('retry-after'))
      const wait = retryAfter > 0 ? retryAfter * 1000 : 600 * 2 ** (attempt - 1) // 0.6s,1.2s,2.4s…
      await sleep(wait)
      continue
    }
    if (!res.ok) {
      const msg = body?.message || body?.error || text || res.statusText
      throw new Error(`post-bridge ${res.status}: ${Array.isArray(msg) ? msg.join('; ') : msg}`)
    }
    return body
  }
}

// TikTok posting is disabled — filter TikTok accounts out here, the single
// source every account picker (Schedule, Bulk, Settings) and the schedule
// guard reads from, so TikTok can never be selected or posted to.
export function isDisabledPlatform(platform) {
  return String(platform || '').toLowerCase() === 'tiktok'
}

export async function listAccounts(token) {
  const body = await pb(token, '/v1/social-accounts?limit=100')
  return (body?.data || []).filter((a) => !isDisabledPlatform(a?.platform))
}

// Build a { media_id → url } map for the given posts in ONE call. post-bridge's
// media URLs live nested at media.object.url (MediaDto), and a post's `media`
// field can come back as bare media-id strings — so we resolve them here.
async function mediaUrlMapForPosts(token, postIds) {
  if (!postIds.length) return {}
  try {
    const qs = postIds.map((id) => `post_id=${encodeURIComponent(id)}`).join('&')
    const body = await pb(token, `/v1/media?limit=200&${qs}`)
    const map = {}
    for (const m of body?.data || []) {
      const url = m?.object?.url
      if (m?.id && url) map[m.id] = url
    }
    return map
  } catch {
    // Thumbnails are best-effort — never block the posts list on a media fetch.
    return {}
  }
}

export async function listPosts(token) {
  const body = await pb(token, '/v1/posts?limit=100')
  const posts = body?.data || []
  const urlById = await mediaUrlMapForPosts(token, posts.map((p) => p.id).filter(Boolean))

  // Normalise each post's media (id-string | {url} | MediaDto) → plain URL list.
  const toUrl = (m) => {
    if (!m) return ''
    if (typeof m === 'string') return urlById[m] || ''
    return m.object?.url || m.url || urlById[m.id] || ''
  }
  for (const p of posts) {
    p.media_urls = (Array.isArray(p.media) ? p.media : []).map(toUrl).filter(Boolean)
  }
  return posts
}

export async function listAnalytics(token) {
  const body = await pb(token, '/v1/analytics?limit=100')
  return body?.data || []
}

// Ask post-bridge to pull fresh metrics from the connected platforms. Returns
// 429 when called too often — the caller treats that as "try again shortly".
export async function syncAnalytics(token) {
  return pb(token, '/v1/analytics/sync', { method: 'POST' })
}

// Upload one image: ask post-bridge for a signed URL, PUT the bytes, return media_id.
// Retries transient failures — when many slides upload at once (bulk scheduling
// fans out 30+ concurrent PUTs) post-bridge / its storage occasionally drops one,
// and a single dropped slide must not fail the whole post.
export async function uploadMedia(token, { buffer, mimeType, name }, attempts = 3) {
  let lastErr
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const created = await pb(token, '/v1/media/create-upload-url', {
        method: 'POST',
        body: JSON.stringify({ mime_type: mimeType, size_bytes: buffer.length, name }),
      })
      const put = await fetch(created.upload_url, {
        method: 'PUT',
        headers: { 'content-type': mimeType },
        body: buffer,
      })
      if (!put.ok) throw new Error(`Media upload failed (${put.status}) for ${name}`)
      return created.media_id
    } catch (e) {
      lastErr = e
      if (attempt < attempts) await sleep(400 * attempt) // 400ms, 800ms backoff
    }
  }
  throw lastErr
}

export async function createPost(token, { caption, mediaIds, socialAccounts, scheduledAt, isDraft }) {
  return pb(token, '/v1/posts', {
    method: 'POST',
    body: JSON.stringify({
      caption,
      media: mediaIds,
      social_accounts: socialAccounts,
      scheduled_at: scheduledAt || null,
      is_draft: !!isDraft,
    }),
  })
}
