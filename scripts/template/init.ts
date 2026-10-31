// One-time init for a project created from the template. Setup imports this only while
// scripts/template/ exists; init deletes the folder, so it can never run twice.
import { rmSync } from 'node:fs'
import { basename } from 'node:path'

import { $ } from 'bun'

import { fail, type InitAnswers, root, step, type TemplateInit } from '../lib'

export const TEMPLATE = {
  repo: 'chanlito/untitled-bun-app',
  name: 'Untitled Bun App',
  slug: 'untitled-bun-app',
}

// The workspace packages' scope: `@untitled-bun-app/api` becomes `@my-app/api`. It may
// appear in any tracked file; init rewrites it wherever it is (see template.test.ts).
export const SCOPE = `@${TEMPLATE.slug}/`

// The only tracked files that may contain the template's name other than in SCOPE
export const RENAMED_FILES = [
  'packages/config/project.config.ts',
  'package.json',
  'docker-compose.yml',
  'README.md',
  'bun.lock',
]

// Only the template repo needs these: init deletes them (see e2e.ts for what they test)
export const TEMPLATE_ONLY = ['scripts/template', '.github/workflows/template.yml']

// Exactly the template's repo (https or ssh), not one whose name merely starts with it
export const isTemplateRemote = (origin: string) =>
  new RegExp(`[/:]${TEMPLATE.repo}(\\.git)?/?$`).test(origin.trim())

export async function isTemplateRepo() {
  return isTemplateRemote(await $`git remote get-url origin`.cwd(root).quiet().nothrow().text())
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
  await renameScope(slug)
  step(`Renamed the packages to @${slug}/* (${scoped.length} files)`)

  for (const path of TEMPLATE_ONLY) rmSync(`${root}${path}`, { recursive: true, force: true })
  step(`Removed template-only files (${TEMPLATE_ONLY.join(', ')})`)

  return { name: finalName, github: { clientId, clientSecret }, demoData } satisfies InitAnswers
}

async function rename(name: string, slug: string) {
  // Replacer functions everywhere: a string replacement would expand `$&`, `$$`… in the name
  const replaceIn = async (file: string, from: string | RegExp, to: string) => {
    const path = `${root}${file}`
    await Bun.write(
      path,
      (await Bun.file(path).text()).replace(from, () => to),
    )
  }
  const quoted = `'${name.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
  await replaceIn('packages/config/project.config.ts', `'${TEMPLATE.name}'`, quoted)
  await replaceIn('packages/config/project.config.ts', `'${TEMPLATE.slug}'`, `'${slug}'`)
  await replaceIn('package.json', `"name": "${TEMPLATE.slug}"`, `"name": "${slug}"`)
  // bun install keeps the old root name in the lockfile, so rename it here
  await replaceIn('bun.lock', `"name": "${TEMPLATE.slug}"`, `"name": "${slug}"`)
  await replaceIn('docker-compose.yml', `name: ${TEMPLATE.slug}`, `name: ${slug}`)
  // Only the title: the rest of the README describes the template and stays useful
  await replaceIn('README.md', /^# .*$/m, `# ${name}`)
}

// Every tracked file that names a package by its scope: manifests, imports, scripts, docs
let scoped: string[] = []
async function renameScope(slug: string) {
  const out = await $`git grep -lF ${SCOPE}`.cwd(root).quiet().nothrow().text()
  scoped = out.split('\n').filter(Boolean)
  for (const file of scoped) {
    const path = `${root}${file}`
    await Bun.write(path, (await Bun.file(path).text()).replaceAll(SCOPE, `@${slug}/`))
  }
  // A new scope can sort differently among the other imports (`@acme/` before `@hono/`)
  const code = scoped.filter((file) => /\.[cm]?tsx?$/.test(file))
  if (code.length) await $`bun fmt ${code}`.cwd(root).quiet()
}

// Commits exactly what init changed, leaving any other work in the tree alone.
// Setup calls it right after runInit, before anything else can fail.
export async function commitInit() {
  const paths = [...new Set([...RENAMED_FILES, ...scoped, ...TEMPLATE_ONLY])]
  await $`git add -A -- ${paths}`.cwd(root).quiet()
  await $`git commit -q -m ${'🎉 chore: initialize from template'} -- ${paths}`.cwd(root).quiet()
  step('Committed: 🎉 chore: initialize from template')
}

// setup.ts can't import this file statically, so this is where its types are checked
void ({ isTemplateRepo, runInit, commitInit } satisfies TemplateInit)
