// Keeps the template renameable: its name may only appear where init rewrites it.
// Lives in scripts/template/, so projects created from the template drop it on init.
import { describe, expect, test } from 'bun:test'
import { $ } from 'bun'
import { root } from '../lib'
import { RENAMED_FILES, slugify } from './init'

const ALLOWED = new Set(RENAMED_FILES)

describe('template', () => {
  test("the template's name only appears in files init renames", async () => {
    const tracked = (await $`git ls-files`.cwd(root).text()).split('\n').filter(Boolean)
    const offenders: string[] = []
    for (const file of tracked) {
      if (ALLOWED.has(file) || file.startsWith('scripts/template/')) continue
      const text = await Bun.file(`${root}${file}`).text()
      if (/untitled/i.test(text)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })

  test('slugify', () => {
    expect(slugify('My Cool API!')).toBe('my-cool-api')
    expect(slugify('  Ünïcode & Co  ')).toBe('unicode-co')
  })
})
