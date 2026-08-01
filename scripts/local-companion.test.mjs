import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rocketpeak-companion-'))
process.env.ROCKETPEAK_PROJECTS_ROOT = root
const helper = await import('./local-companion.mjs')

describe('local companion', () => {
  beforeAll(async () => fs.mkdir(root, { recursive: true }))
  afterAll(async () => fs.rm(root, { recursive: true, force: true }))
  test('creates the approved project structure and brief', async () => {
    const target = await helper.ensureProjectStructure({ id: 'project-1', name: 'Test Client', product: 'Product' })
    expect(target.startsWith(root)).toBe(true)
    await expect(fs.stat(path.join(target, '02 Креативы', 'Сгенерированные'))).resolves.toBeTruthy()
    await expect(fs.readFile(path.join(target, '00 Бриф', 'project-brief.json'), 'utf8')).resolves.toContain('project-1')
  })
  test('sanitizes unsafe Windows filename characters', () => expect(helper.safeProjectName('Client: Test?')).toBe('Client Test'))
  test('blocks reserved Windows names', () => expect(() => helper.safeProjectName('CON')).toThrow('reserved_project_name'))
})
