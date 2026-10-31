// Keeps the template renameable: its name may only appear where init rewrites it.
// Lives in scripts/template/, so projects created from the template drop it on init.
import { describe, expect, test } from 'bun:test'

import { $ } from 'bun'

import { root } from '../lib'
import { isTemplateRemote, RENAMED_FILES, SCOPE, slugify } from './init'

const ALLOWED = new Set(RENAMED_FILES)

describe('template', () => {
  test("the template's name only appears in files init renames", async () => {
    const tracked = (await $`git ls-files`.cwd(root).text()).split('\n').filter(Boolean)
    const offenders: string[] = []
    for (const file of tracked) {
      if (ALLOWED.has(file) || file.startsWith('scripts/template/')) continue
      // The package scope may appear anywhere: init renames it in every file
      const text = (await Bun.file(`${root}${file}`).text()).replaceAll(SCOPE, '')
      if (/untitled/i.test(text)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })

  test('isTemplateRemote matches only the template repo itself', () => {
    expect(isTemplateRemote('git@github.com:chanlito/untitled-bun-app.git\n')).toBe(true)
    expect(isTemplateRemote('https://github.com/chanlito/untitled-bun-app')).toBe(true)
    expect(isTemplateRemote('git@github.com:chanlito/untitled-bun-app-api.git')).toBe(false)
    expect(isTemplateRemote('/home/me/projects/untitled-bun-app')).toBe(false)
  })

  test('slugify', () => {
    expect(slugify('My Cool API!')).toBe('my-cool-api')
    expect(slugify('  Ünïcode & Co  ')).toBe('unicode-co')
  })
})
