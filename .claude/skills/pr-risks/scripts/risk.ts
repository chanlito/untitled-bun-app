// The risk tier this branch calls for, why, and which reviews that means.
//
//   bun scripts/risk.ts               the branch's changed files
//   bun scripts/risk.ts a.ts b/c.ts   these files instead
//   bun scripts/risk.ts --json        the same, for scripts
//
// The paths for each tier come from skills.config.ts ("tiers").

import { config } from './config';
import { label, printTier, tier } from './tier';

const args = process.argv.slice(2);
const json = args.includes('--json');
const files = args.filter((a) => a !== '--json');
if (json) {
  const found = tier(files.length ? files : undefined);
  console.log(
    JSON.stringify({
      ...found,
      reason: config().tiers.reasons[found.tier],
      label: label(found.tier),
      reviews: config().tiers.reviews[found.tier],
    }),
  );
} else printTier(files.length ? files : undefined);
