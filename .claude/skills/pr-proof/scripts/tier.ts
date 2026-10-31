// The risk tier a change calls for, from the paths it touches. The highest
// tier any file calls for wins. Paths can't tell a new sign-in, permission,
// payment or outside integration, so the person or agent still checks that.
//
// Shared by every skill in chanlito/skills: edit it in shared/ and run
// `bun run sync`.

import { config, glob, type Tier } from './config';
import { changedFiles } from './git';

export function tier(files = changedFiles()): { tier: Tier; files: string[] } {
  const { high, medium, low } = config().tiers;
  const is = (patterns: string[]) => {
    const res = patterns.map(glob);
    return (f: string) => res.some((r) => r.test(f));
  };
  const [isHigh, isMedium, isLow] = [is(high), is(medium), is(low)];
  const h = files.filter(isHigh);
  if (h.length) return { tier: 'High', files: h };
  const m = files.filter((f) => isMedium(f) || !isLow(f));
  if (m.length) return { tier: 'Medium', files: m };
  return { tier: 'Low', files };
}

/** The label for a tier, or '' when the project uses none. */
export function label(t: Tier) {
  return config().tiers.label.replaceAll('{tier}', t.toLowerCase());
}

/** The tier as one line for a PR: tier, reason and label. */
export function summary(t: Tier) {
  const l = label(t);
  return `${t}. Reason: ${config().tiers.reasons[t]}.${l ? ` Label: \`${l}\`` : ''}`;
}

/** Prints the tier, the files that set it, and the reviews it gets. */
export function printTier(files?: string[]) {
  const found = tier(files);
  console.log(`Tier: ${summary(found.tier)}`);
  for (const f of found.files.slice(0, 8)) console.log(`  ${f}`);
  if (found.files.length > 8)
    console.log(`  …and ${found.files.length - 8} more`);
  const reviews = config().tiers.reviews[found.tier];
  console.log(
    reviews.length
      ? `Reviews: ${reviews.join('; ')}.`
      : 'Reviews: none beyond the checks.',
  );
  if (found.tier !== 'High')
    console.log(
      'A new sign-in, permission, payment or outside integration makes it High; paths alone can not tell.',
    );
  return found;
}
