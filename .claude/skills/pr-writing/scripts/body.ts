// The PR description to start from: the project's PR template (or this
// skill's template.md when it has none) with the preview link and the
// suggested risk tier filled in. Fill in the rest by hand.
//
//   bun scripts/body.ts
//
// It fills a line starting "**Preview:**" and one starting "**Tier:**", or
// {{preview}} and {{tier}} anywhere in the template.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, root } from './config';
import { previewUrl } from './git';
import { tier } from './tier';

const mine = join(root(), config().template);
const template = readFileSync(
  existsSync(mine)
    ? mine
    : join(dirname(fileURLToPath(import.meta.url)), '..', 'template.md'),
  'utf8',
);
const preview = previewUrl();
// Only the tier: the label shows on the PR, and the reason is in the config.
const t = tier().tier;

let body = template
  .replaceAll('{{preview}}', preview)
  .replaceAll('{{tier}}', t)
  .replace(/^\*\*Tier:\*\* .*$/m, `**Tier:** ${t}`);
body = preview
  ? body.replace(/^\*\*Preview:\*\* .*$/m, `**Preview:** ${preview}`)
  : body.replace(/^\*\*Preview:\*\* .*\n+/m, '');
console.log(body);
