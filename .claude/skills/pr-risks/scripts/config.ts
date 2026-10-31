// The project's settings for these skills, from skills.config.json at the
// root of the repo. Every field is optional; what's left out falls back to
// the defaults below, which suit a plain web project with one language.
//
// This file is shared by every skill in chanlito/skills. Edit it in shared/
// and run `bun run sync`, which copies it into each skill's scripts/.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Tier = 'Low' | 'Medium' | 'High';

export type Config = {
  /** The branch PRs go into, as a ref to compare with. */
  base: string;
  /** Commands that must pass before a push, in order. */
  checks: string[];
  branch: {
    /** A branch name should match this (a warning when it doesn't). */
    pattern: string;
    /** A branch name must not match this (a failure). Empty for none. */
    forbid: string;
  };
  /**
   * The commit subject format: "conventional" (feat(scope): message),
   * "gitmoji" (✨ feat(scope): message), "any", or a regular expression.
   */
  commits: string;
  /** The PR preview URL, with {branch} as the branch name in dashes. Empty for none. */
  preview: string;
  /** The PR template to fill in. The skill's own is used when it's missing. */
  template: string;
  tiers: {
    /** Paths (globs) that make a change High. */
    high: string[];
    /** Paths that make it at least Medium, even when they'd be Low. */
    medium: string[];
    /** Paths that are Low on their own. Anything else is Medium. */
    low: string[];
    /** Why each tier, in a few words, for the PR. */
    reasons: Record<Tier, string>;
    /** The reviews each tier gets, in order. */
    reviews: Record<Tier, string[]>;
    /** The label to add, with {tier} as low, medium or high. Empty for none. */
    label: string;
  };
  site: {
    /** Builds the site. */
    build: string;
    /** Where the build writes its pages. */
    dist: string;
    /** What the build reads: when one is newer than the build, it rebuilds. */
    sources: string[];
    /** The pages to shoot when none are named. */
    pages: string[];
    languages: {
      /** The language of pages without a prefix. */
      default: string;
      /** Languages served under /<lang>/. */
      prefixed: string[];
    };
    /** API paths to answer with made-up JSON, by method ("*" for any). */
    fakes: Record<string, Record<string, unknown>>;
    /** Extra Chromium flags. */
    chromium: string[];
  };
  proof: {
    /** The branch screenshots are pushed to. */
    branch: string;
    /**
     * How an image on that branch is linked from the PR. {repo} is owner/name,
     * {branch} the proof branch, {path} the file. The raw.githubusercontent
     * link only works for public repos; private ones need the blob link
     * with ?raw=true.
     */
    image: string;
  };
  /**
   * Where lessons live: "local" keeps them in this clone only (inside .git,
   * so nothing is ever committed), "commit" keeps them in lessonsDir for
   * review in PRs, "off" turns them off.
   */
  lessons: 'local' | 'commit' | 'off';
  lessonsDir: string;
  /** Most lessons each skill keeps. */
  maxLessons: number;
  khmer: {
    /** The project's Khmer glossary and style choices. */
    glossary: string;
    /** Numbers in Khmer prose: "khmer" (១២៣), "latin" (123) or "any". */
    numerals: 'khmer' | 'latin' | 'any';
    /** Quotes around Khmer: "guillemets" («»), "any". */
    quotes: 'guillemets' | 'any';
    /** Extra word lists (one word per line) that count as known words. */
    wordlists: string[];
    /** Files to check when none are named. */
    files: string[];
    /** Files never checked, such as examples of typing mistakes. */
    ignore: string[];
  };
};

export const DEFAULTS: Config = {
  base: 'origin/main',
  checks: [],
  branch: {
    pattern: '^(feat|fix|chore|docs|refactor|perf|test|build|ci)/[a-z0-9._-]+$',
    forbid: '',
  },
  commits: 'conventional',
  preview: '',
  template: '.github/pull_request_template.md',
  tiers: {
    high: [
      '.github/workflows/**',
      '**/migrations/**',
      '**/auth/**',
      '**/*.tf',
      'Dockerfile',
      '**/.env*',
    ],
    medium: ['AGENTS.md', 'CLAUDE.md', '.claude/**', '.agents/**'],
    low: ['**/*.md', '**/*.mdx', 'docs/**'],
    reasons: {
      High: 'touches deploy, CI, data or sign-in',
      Medium: 'changes how the project looks or works',
      Low: 'only docs or content',
    },
    reviews: {
      Low: [],
      Medium: ['code review (/code-review medium), up to 2 rounds'],
      High: [
        'code review (/code-review high), up to 3 rounds',
        'security review (/security-review)',
        'a person reads the diff',
      ],
    },
    label: 'risk:{tier}',
  },
  site: {
    build: 'npm run build',
    dist: 'dist',
    sources: [
      'src',
      'public',
      'package.json',
      'package-lock.json',
      'bun.lock',
      'pnpm-lock.yaml',
    ],
    pages: ['/'],
    languages: { default: 'en', prefixed: [] },
    fakes: {},
    chromium: [],
  },
  proof: {
    branch: 'pr-proof',
    image: 'https://raw.githubusercontent.com/{repo}/{branch}/{path}',
  },
  lessons: 'local',
  lessonsDir: '.agents/lessons',
  maxLessons: 12,
  khmer: {
    glossary: '.agents/khmer-glossary.md',
    numerals: 'any',
    quotes: 'any',
    wordlists: [],
    files: [
      '**/*.md',
      '**/*.mdx',
      '**/*.json',
      '**/*.ts',
      '**/*.tsx',
      '**/*.astro',
      '**/*.vue',
      '**/*.svelte',
      '**/*.html',
      '**/*.yml',
      '**/*.yaml',
    ],
    ignore: [],
  },
};

export const CONFIG_FILE = 'skills.config.json';
/** The file's old name, still read when the new one isn't there. */
export const LEGACY_CONFIG_FILE = 'show-your-work.json';

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Fills what `mine` leaves out from `base`. Arrays and values replace. */
function merge<T>(base: T, mine: unknown): T {
  if (!isPlain(base) || !isPlain(mine)) return (mine ?? base) as T;
  const out: Plain = { ...base };
  for (const [key, value] of Object.entries(mine))
    out[key] = key in base ? merge((base as Plain)[key], value) : value;
  return out as T;
}

/** The repo's top folder, so the scripts work from anywhere inside it. */
export function root() {
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  }).stdout?.trim();
  return top || process.cwd();
}

let cached: Config | undefined;
export function config(): Config {
  if (cached) return cached;
  const file = [CONFIG_FILE, LEGACY_CONFIG_FILE]
    .map((name) => join(root(), name))
    .find((path) => existsSync(path));
  const mine = file ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
  if (isPlain(mine)) delete mine.$schema;
  return (cached = merge(DEFAULTS, mine));
}

/** Every language the site has, the unprefixed one first. */
export function languages() {
  const { default: main, prefixed } = config().site.languages;
  return [main, ...prefixed];
}

/** Turns a glob into a regular expression: ** is any folders, * any name. */
export function glob(pattern: string) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      // "**/" matches no folders too.
      re += pattern[i + 2] === '/' ? '(?:.*/)?' : '.*';
      i += pattern[i + 2] === '/' ? 2 : 1;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}
