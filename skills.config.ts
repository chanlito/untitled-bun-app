// Settings for the pr-writing, pr-risks and pr-proof skills in .claude/skills/.
// Every field is optional; see the skills' SKILL.md for the rest.
export default {
  // pr-writing runs these before every push: lint, format, typecheck, tests.
  checks: ['bun run verify'],
  commits: 'gitmoji',
  tiers: {
    // Added to the skills' defaults, which already cover CI, Docker, .env
    // files, migrations, auth, package.json and lockfiles, bunfig.toml, this
    // file and the skills themselves. Only this project's own paths go here.
    high: [
      // Runtime settings: a wrong default reaches production.
      'apps/api/src/env.ts',
      // The database: a bad migration or schema change can lose data.
      'apps/api/drizzle/**',
      'apps/api/src/db/**',
      // Every request goes through it: CORS, secure headers, rate limits.
      'apps/api/src/app.ts',
      // Who is signed in and what they can reach.
      'apps/api/src/lib/require-user.ts',
      // Sends email to real people.
      'apps/api/src/lib/mailer.ts',
      // Setup and template scripts run on developers' machines and in CI.
      'scripts/**',
    ],
  },
  // Committed in .agents/lessons/, so cloud agents on a fresh clone see them.
  lessons: 'commit',
}
