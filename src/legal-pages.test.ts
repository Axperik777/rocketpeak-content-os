import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readPublicFile = (name: string) => readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8')

describe('Meta public documents', () => {
  it.each(['privacy.html', 'terms.html', 'data-deletion.html'])('%s is public, branded and contactable', (file) => {
    const html = readPublicFile(file)
    expect(html).toContain('RocketPeak Content OS')
    expect(html).toContain('developers@rocket-peak.com')
    expect(html).toContain('meta name="robots" content="index,follow"')
  })

  it('privacy policy explains Meta data and server-side token handling', () => {
    const html = readPublicFile('privacy.html')
    expect(html).toContain('Данные платформ Meta')
    expect(html).toContain('Токены должны храниться только на сервере')
    expect(html).toContain('удаления данных')
  })

  it('deletion page contains a concrete request procedure', () => {
    const html = readPublicFile('data-deletion.html')
    expect(html).toContain('Удаление данных Content OS')
    expect(html).toContain('в течение 30 дней')
    expect(html).toContain('Приложения и сайты')
  })
})
