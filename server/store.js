// Shared-workspace persistence, backed by Supabase. The whole team shares one
// config + one queue, stored as JSONB singletons in the `app_kv` table (keys
// 'config' and 'queue') — mirroring the old config.json / queue.json files.
//
// Everything here is async (Supabase is a network call). A "project" is one
// brand/account you generate for; only the Brain + default post-bridge accounts
// differ per project. API keys and model are global.
import { supabase } from './supabase.js'
import { bundledPackNames } from './library.js'

const DEFAULT_BRAIN = {
  niche: '',
  appName: '',
  appDescription: '',
  audience: '',
  styleMemory: '',
}
const DEFAULT_DEFAULTS = { socialAccountIds: [], mode: 'draft' }

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e6)}`
}
function makeProject(name, brain, defaults, imagePacks) {
  return {
    id: newId('p'),
    name: name || 'Project 1',
    brain: { ...DEFAULT_BRAIN, ...brain },
    defaults: { ...DEFAULT_DEFAULTS, ...defaults },
    // Which background packs generation draws from. Defaults to all bundled
    // packs so a fresh project generates with images out of the box. Empty = gradients.
    imagePacks: imagePacks ?? bundledPackNames(),
  }
}

// ── app_kv singleton helpers ──────────────────────────────────────────────────
async function kvGet(key, fallback) {
  const { data, error } = await supabase.from('app_kv').select('value').eq('key', key).maybeSingle()
  if (error) throw new Error(`supabase read "${key}": ${error.message}`)
  return data ? data.value : fallback
}
async function kvSet(key, value) {
  const { error } = await supabase
    .from('app_kv')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw new Error(`supabase write "${key}": ${error.message}`)
  return value
}

// Normalize on every read: fill defaults and migrate the old single-brain shape
// ({ brain, defaults } at top level) into projects[].
export async function getConfig() {
  const s = (await kvGet('config', {})) || {}
  let projects = Array.isArray(s.projects) && s.projects.length
    ? s.projects.map((p) => ({
        id: p.id || newId('p'),
        name: p.name || 'Project',
        brain: { ...DEFAULT_BRAIN, ...p.brain },
        defaults: { ...DEFAULT_DEFAULTS, ...p.defaults },
        imagePacks: p.imagePacks ?? bundledPackNames(),
      }))
    : null

  if (!projects) {
    // Migrate a pre-projects config, or create the first project.
    projects = [makeProject(s.brain?.appName || 'Project 1', s.brain, s.defaults)]
  }

  const activeProjectId = projects.some((p) => p.id === s.activeProjectId)
    ? s.activeProjectId
    : projects[0].id

  const cfg = {
    keys: { postbridge: '', openrouter: '', apify: '', ...s.keys },
    model: s.model || 'openai/gpt-4o-mini',
    pinterestActor: s.pinterestActor || 'fatihtahta/pinterest-scraper-search',
    projects,
    activeProjectId,
  }

  // If we synthesized/migrated projects, persist once so ids stay stable across
  // reads (otherwise every read would mint fresh ids).
  const needsPersist =
    !Array.isArray(s.projects) ||
    s.projects.length !== projects.length ||
    s.activeProjectId !== activeProjectId ||
    s.projects.some((p, i) => p.id !== projects[i].id)
  if (needsPersist) await kvSet('config', cfg)

  return cfg
}

async function writeConfig(cfg) {
  await kvSet('config', cfg)
  return cfg
}

// Global settings only (keys + model). Project data is edited via the project ops.
export async function saveGlobal(patch) {
  const c = await getConfig()
  return writeConfig({
    ...c,
    model: patch.model ?? c.model,
    pinterestActor: patch.pinterestActor ?? c.pinterestActor,
    keys: { ...c.keys, ...patch.keys },
  })
}

// Pass a preloaded config to avoid a second fetch, or omit to load one.
export async function getActiveProject(c) {
  const cfg = c || (await getConfig())
  return cfg.projects.find((p) => p.id === cfg.activeProjectId) || cfg.projects[0]
}

export async function createProject(name) {
  const c = await getConfig()
  const project = makeProject(name || `Project ${c.projects.length + 1}`)
  return writeConfig({ ...c, projects: [...c.projects, project], activeProjectId: project.id })
}

export async function updateProject(id, patch) {
  const c = await getConfig()
  const projects = c.projects.map((p) =>
    p.id === id
      ? {
          ...p,
          name: patch.name ?? p.name,
          brain: patch.brain ? { ...p.brain, ...patch.brain } : p.brain,
          defaults: patch.defaults ? { ...p.defaults, ...patch.defaults } : p.defaults,
          imagePacks: patch.imagePacks ?? p.imagePacks,
        }
      : p
  )
  return writeConfig({ ...c, projects })
}

export async function deleteProject(id) {
  const c = await getConfig()
  let projects = c.projects.filter((p) => p.id !== id)
  if (!projects.length) projects = [makeProject('Project 1')]
  const activeProjectId = c.activeProjectId === id ? projects[0].id : c.activeProjectId
  await removeQueueFor(id)
  return writeConfig({ ...c, projects, activeProjectId })
}

export async function setActiveProject(id) {
  const c = await getConfig()
  if (!c.projects.some((p) => p.id === id)) throw new Error('Unknown project')
  return writeConfig({ ...c, activeProjectId: id })
}

// ── Queue (per project, stored as one { projectId: Slideshow[] } map) ─────────
async function readQueueMap() {
  const m = await kvGet('queue', {})
  return m && !Array.isArray(m) ? m : {}
}
async function writeQueueMap(m) {
  await kvSet('queue', m)
  return m
}
export async function getQueue(projectId) {
  return (await readQueueMap())[projectId] || []
}
export async function setQueue(projectId, items) {
  const m = await readQueueMap()
  m[projectId] = items
  await writeQueueMap(m)
  return items
}
export async function addToQueue(projectId, items) {
  return setQueue(projectId, [...items, ...(await getQueue(projectId))])
}
export async function removeFromQueue(projectId, id) {
  return setQueue(projectId, (await getQueue(projectId)).filter((s) => s.id !== id))
}
async function removeQueueFor(projectId) {
  const m = await readQueueMap()
  delete m[projectId]
  await writeQueueMap(m)
}
