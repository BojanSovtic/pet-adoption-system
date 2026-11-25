import { constants, copyFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { PETS } from './demo-data';
import {
  DEMO_IMAGE_DIR,
  planDemoImagePreparation,
  type DemoImageMapping,
} from './demo-images';

/**
 * Copies downloaded images to the names the seed (pnpm dev:seed / qa:seed) looks for, as listed
 * in demo-images/mapping.json (e.g. "dog.4048.jpg" → "max.jpg"). The
 * originals are kept. It never overwrites a different file and is safe to run
 * again. `--dry-run` only shows what it would do.
 */
const main = () => {
  const dryRun = process.argv.includes('--dry-run');
  const mappingPath = path.join(DEMO_IMAGE_DIR, 'mapping.json');

  if (!existsSync(mappingPath)) {
    throw new Error(`${mappingPath} not found.`);
  }

  const mapping = JSON.parse(
    readFileSync(mappingPath, 'utf8'),
  ) as DemoImageMapping;
  const plan = planDemoImagePreparation(mapping, PETS, DEMO_IMAGE_DIR);

  for (const warning of plan.warnings) {
    console.warn(`  ! ${warning}`);
  }

  if (plan.errors.length > 0) {
    console.error(
      `Nothing was copied. Fix mapping.json or the files first:\n  ${plan.errors.join('\n  ')}`,
    );
    process.exit(1);
  }

  for (const step of plan.steps) {
    if (step.action === 'copy' && !dryRun) {
      // COPYFILE_EXCL: fail instead of overwriting, even if a file appeared
      // since the plan was made.
      copyFileSync(
        path.join(DEMO_IMAGE_DIR, step.source),
        path.join(DEMO_IMAGE_DIR, step.target),
        constants.COPYFILE_EXCL,
      );
    }

    const verb =
      step.action === 'unchanged' ? '=' : dryRun ? 'would copy' : '+';
    console.log(`  ${verb} ${step.source} → ${step.target}`);
  }

  const copies = plan.steps.filter((step) => step.action === 'copy').length;
  console.log(
    `\n${dryRun ? 'Dry run: would copy' : 'Copied'} ${copies} file(s); ${plan.steps.length - copies} already prepared.` +
      (dryRun
        ? ''
        : ' Next: pnpm dev:seed (with the dev API running) or pnpm qa:seed.'),
  );
};

try {
  main();
} catch (error) {
  console.error(`[ images ] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
