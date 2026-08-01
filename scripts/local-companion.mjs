import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

export const PORT = 43121
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
      if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, root: PROJECTS_ROOT, host: os.hostname() }, origin)
      if (req.method === 'POST' && req.url === '/projects') {
        const projectPath = await ensureProjectStructure(await readJson(req))
        return send(res, 200, { ok: true, path: projectPath }, origin)
      }
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
