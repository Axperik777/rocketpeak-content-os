import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

export const PORT = 43121
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST_ROOT = path.join(APP_ROOT, 'dist')
const PUBLISHED_APP = 'https://axperik777.github.io/rocketpeak-content-os'
export const PROJECTS_ROOT = process.env.ROCKETPEAK_PROJECTS_ROOT || 'C:\\Users\\Mylaptop\\Desktop\\MARKETING\\Проекты'
export const PROJECT_FOLDERS = [
  ['00 Бриф'],
  ['01 Лендинг', 'Исходники'],
  ['01 Лендинг', 'Готовое'],
  ['02 Креативы', 'Референсы'],
  ['02 Креативы', 'Сгенерированные'],
  ['02 Креативы', 'Одобренные'],
  ['03 Тексты объявлений', 'Meta'],
  ['03 Тексты объявлений', 'TikTok'],
  ['03 Тексты объявлений', 'Google'],
  ['04 Экспорт'],
]

const allowedOrigins = new Set([
  'https://axperik777.github.io',
  'http://127.0.0.1:43121',
  'http://localhost:43121',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
])

export function safeProjectName(value) {
  const name = String(value ?? '').trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').replace(/[. ]+$/g, '')
  if (name.length < 2 || name.length > 120) throw new Error('invalid_project_name')
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) throw new Error('reserved_project_name')
  return name
}

function insideRoot(target) {
  const root = path.resolve(PROJECTS_ROOT)
  const resolved = path.resolve(target)
  return resolved === root || resolved.startsWith(`${root}${path.sep}`)
}

export async function ensureProjectStructure(project) {
  const name = safeProjectName(project.name)
  const projectPath = path.join(PROJECTS_ROOT, name)
  if (!insideRoot(projectPath)) throw new Error('path_outside_projects_root')
  await fs.mkdir(projectPath, { recursive: true })
  await Promise.all(PROJECT_FOLDERS.map((segments) => fs.mkdir(path.join(projectPath, ...segments), { recursive: true })))
  const brief = {
    projectId: project.id ?? null,
    name,
    product: project.product ?? '',
    geography: project.geography ?? '',
    audience: project.audience ?? '',
    offer: project.offer ?? '',
    proof: project.proof ?? '',
    restrictions: project.restrictions ?? '',
    language: project.language ?? 'Русский',
    synchronizedAt: new Date().toISOString(),
  }
  await fs.writeFile(path.join(projectPath, '00 Бриф', 'project-brief.json'), JSON.stringify(brief, null, 2), 'utf8')
  return projectPath
}

function send(res, status, body, origin) {
  if (origin && allowedOrigins.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.writeHead(status)
  res.end(JSON.stringify(body))
}

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webp': 'image/webp',
}

async function sendStatic(req, res) {
  const requestPath = decodeURIComponent(new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`).pathname)
  try {
    const publishedUrl = requestPath.startsWith('/rocketpeak-content-os/')
      ? `https://axperik777.github.io${requestPath}`
      : `${PUBLISHED_APP}${requestPath}`
    const published = await fetch(publishedUrl, { redirect: 'follow' })
    if (published.ok) {
      const contents = Buffer.from(await published.arrayBuffer())
      res.setHeader('Content-Type', published.headers.get('content-type') ?? contentTypes[path.extname(requestPath).toLowerCase()] ?? 'application/octet-stream')
      res.setHeader('Cache-Control', requestPath === '/' ? 'no-store' : 'public, max-age=300')
      res.writeHead(200); res.end(contents); return
    }
  } catch {
    // Fall back to the last local build when the published app is unreachable.
  }
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '')
  let target = path.resolve(DIST_ROOT, relativePath)
  if (!(target === DIST_ROOT || target.startsWith(`${DIST_ROOT}${path.sep}`))) {
    res.writeHead(403); res.end('Forbidden'); return
  }
  try {
    const stats = await fs.stat(target)
    if (stats.isDirectory()) target = path.join(target, 'index.html')
    const contents = await fs.readFile(target)
    res.setHeader('Content-Type', contentTypes[path.extname(target).toLowerCase()] ?? 'application/octet-stream')
    res.setHeader('Cache-Control', target.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000, immutable')
    res.writeHead(200); res.end(contents)
  } catch {
    const index = await fs.readFile(path.join(DIST_ROOT, 'index.html'))
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.writeHead(200); res.end(index)
  }
}

async function readJson(req) {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 1_000_000) throw new Error('payload_too_large')
  }
  return JSON.parse(raw || '{}')
}

export function createCompanionServer() {
  return http.createServer(async (req, res) => {
    const origin = req.headers.origin
    if (req.method === 'OPTIONS') {
      if (!origin || !allowedOrigins.has(origin)) return send(res, 403, { error: 'origin_not_allowed' })
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      res.setHeader('Access-Control-Allow-Private-Network', 'true')
      res.setHeader('Vary', 'Origin')
      res.writeHead(204); res.end(); return
    }
    if (origin && !allowedOrigins.has(origin)) return send(res, 403, { error: 'origin_not_allowed' })
    try {
      if (req.method === 'GET' && (req.url === '/health' || req.url === '/api/health')) return send(res, 200, { ok: true, root: PROJECTS_ROOT, host: os.hostname() }, origin)
      if (req.method === 'POST' && (req.url === '/projects' || req.url === '/api/projects')) {
        const projectPath = await ensureProjectStructure(await readJson(req))
        return send(res, 200, { ok: true, path: projectPath }, origin)
      }
      if (req.method === 'GET') return sendStatic(req, res)
      return send(res, 404, { error: 'not_found' }, origin)
    } catch (error) {
      return send(res, 400, { error: error instanceof Error ? error.message : 'unknown_error' }, origin)
    }
  })
}

if (process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  await fs.mkdir(PROJECTS_ROOT, { recursive: true })
  createCompanionServer().listen(PORT, '127.0.0.1', () => console.log(`RocketPeak local companion: http://127.0.0.1:${PORT}`))
}
