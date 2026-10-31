// One-time init for a project created from the template. Setup imports this only while
// scripts/template/ exists; init deletes the folder, so it can never run twice.
import { rmSync } from 'node:fs'
import { basename } from 'node:path'
import { $ } from 'bun'
import { fail, root, step } from '../lib'

export const TEMPLATE = {
  repo: 'chanlito/untitled-bun-app',
  name: 'Untitled Bun App',
  slug: 'untitled-bun-app',
}

// The only tracked files that may contain the template's name (see template.test.ts)
export const RENAMED_FILES = [
  'project.config.ts',
  'package.json',
  'docker-compose.yml',
  'README.md',
  'bun.lock',
]

export async function isTemplateRepo() {
  const origin = await $`git remote get-url origin`.cwd(root).quiet().nothrow().text()
  return origin.includes(TEMPLATE.repo)
}

export type InitAnswers = {
  name: string
  github: { clientId: string; clientSecret: string }
  demoData: boolean
}

export function slugify(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

const titleCase = (slug: string) =>
  slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ')

export async function runInit({ name, yes }: { name?: string; yes?: boolean }) {
  const interactive = Boolean(process.stdin.isTTY) && !yes
  if (!name && !interactive) {
    fail(
      'This is a new project from the template. Run `bun run setup` in a terminal, or pass --name "My App"',
    )
  }

  console.log('◆ New project from the template\n')
  const suggested = titleCase(basename(root.replace(/\/$/, ''))) || 'My App'
  const finalName = name ?? prompt('Project name?', suggested) ?? suggested
  const slug = slugify(finalName)
  if (!slug) fail(`"${finalName}" has no letters or digits to make a slug from`)
  if (slug === TEMPLATE.slug) fail("Pick a name other than the template's own")

  const clientId = interactive
    ? (prompt('GitHub login? Paste a client ID, or leave empty to skip:') ?? '').trim()
    : ''
  const clientSecret = clientId ? (prompt('GitHub client secret:') ?? '').trim() : ''
  const demoData = interactive
    ? !/^n/i.test(prompt('Load demo data (2 users, 10 tasks)? Y/n', 'Y') ?? 'Y')
    : true

  await rename(finalName, slug)
  step(`Renamed to "${finalName}" (${RENAMED_FILES.join(', ')})`)

  rmSync(`${root}scripts/template`, { recursive: true, force: true })
  step('Removed template-only files (scripts/template/)')

  return { name: finalName, github: { clientId, clientSecret }, demoData } satisfies InitAnswers
}

async function rename(name: string, slug: string) {
  const replaceIn = async (file: string, edit: (text: string) => string) => {
    const path = `${root}${file}`
    await Bun.write(path, edit(await Bun.file(path).text()))
  }
  await replaceIn('project.config.ts', (t) =>
    t
      .replace(`'${TEMPLATE.name}'`, `'${name.replaceAll("'", "\\'")}'`)
      .replace(`'${TEMPLATE.slug}'`, `'${slug}'`),
  )
  await replaceIn('package.json', (t) =>
    t.replace(`"name": "${TEMPLATE.slug}"`, `"name": "${slug}"`),
  )
  // bun install keeps the old root name in the lockfile, so rename it here
  await replaceIn('bun.lock', (t) => t.replace(`"name": "${TEMPLATE.slug}"`, `"name": "${slug}"`))
  await replaceIn('docker-compose.yml', (t) => t.replace(`name: ${TEMPLATE.slug}`, `name: ${slug}`))
  // Only the title: the rest of the README describes the template and stays useful
  await replaceIn('README.md', (t) => t.replace(/^# .*$/m, `# ${name}`))
}

// Commits exactly what init changed, leaving any other work in the tree alone
export async function commitInit() {
  const paths = [...RENAMED_FILES, 'scripts/template']
  await $`git add -A -- ${paths}`.cwd(root).quiet()
  await $`git commit -q -m ${'chore: 🎉 initialize from template'} -- ${paths}`.cwd(root).quiet()
  step('Committed: chore: 🎉 initialize from template')
}
