// Settings for the pr-writing, pr-risks and pr-proof skills in .claude/skills/.
// Every field is optional; see the skills' SKILL.md for the rest.
export default {
  // pr-writing runs these before every push: lint, format, typecheck, tests.
  checks: ['bun run verify'],
  commits: 'gitmoji',
  tiers: {
    // The highest tier any changed file calls for wins.
    high: [
      // CI decides what gets merged and released.
      '.github/workflows/**',
      // How the app is built and run in production.
      '**/Dockerfile',
      'docker-compose.yml',
      // Secrets and runtime settings.
      '**/.env*',
      'apps/api/src/env.ts',
      // The database: a bad migration or schema change can lose data.
      'apps/api/drizzle/**',
      'apps/api/src/db/schema/**',
      'apps/api/src/db/migrate.ts',
      'apps/api/src/db/client.ts',
      'apps/api/drizzle.config.ts',
      // Every request goes through it: CORS, secure headers, rate limits.
      'apps/api/src/app.ts',
      // Who is signed in and what they can reach.
      'apps/api/src/lib/auth.ts',
      'apps/api/src/lib/require-user.ts',
      // Sends email to real people.
      'apps/api/src/lib/mailer.ts',
      // Setup and template scripts run on developers' machines and in CI.
      'scripts/**',
      // Dependencies and tooling config change what code runs everywhere.
      '**/package.json',
      'bun.lock',
      '**/bunfig.toml',
      // The skills run commands, and this file decides what they check.
      'skills.config.ts',
      '.claude/skills/**',
      'skills-lock.json',
    ],
    // Instructions agents follow on every change.
    medium: ['AGENTS.md', 'CLAUDE.md', '.claude/**', '.agents/**'],
  },
  // Committed in .agents/lessons/, so cloud agents on a fresh clone see them.
  lessons: 'commit',
}
