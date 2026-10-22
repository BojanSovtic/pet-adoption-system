import { rm } from 'node:fs/promises';
import mongoose from 'mongoose';

import {
  DEMO_DB_SUFFIX,
  DEMO_MONGODB_URI,
  DEMO_UPLOADS_DIR,
  DEV_UPLOADS_DIR,
  getDatabaseName,
} from './demo-config';

/**
 * Empties the demo database and deletes the demo photos, so seed-demo can
 * start over. Only a database whose name ends with "-demo" is touched; the
 * development database and apps/api/uploads never are.
 *
 * Without --yes it only shows what it would delete. Documents are deleted
 * but collections and indexes are kept, so the unique rules stay in place
 * even if the demo API is running (signed-in demo users are signed out).
 */
const main = async () => {
  const confirmed = process.argv.includes('--yes');
  const databaseName = getDatabaseName(DEMO_MONGODB_URI);

  if (!databaseName.endsWith(DEMO_DB_SUFFIX)) {
    throw new Error(
      `Refusing to reset "${databaseName}": only databases ending with "${DEMO_DB_SUFFIX}" can be reset.`,
    );
  }

  if (DEMO_UPLOADS_DIR === DEV_UPLOADS_DIR) {
    throw new Error('Refusing to delete the development photo folder.');
  }

  await mongoose.connect(DEMO_MONGODB_URI, { serverSelectionTimeoutMS: 5000 });

  try {
    const db = mongoose.connection.db;

    if (!db || db.databaseName !== databaseName) {
      throw new Error(`Connected to an unexpected database.`);
    }

    const collections = await db.collections();
    const counts = await Promise.all(
      collections.map(
        async (collection) =>
          `${collection.collectionName}: ${await collection.countDocuments()}`,
      ),
    );

    console.log(
      `Database "${databaseName}"\n  ${counts.join('\n  ') || '(empty)'}\nPhotos: ${DEMO_UPLOADS_DIR}`,
    );

    if (!confirmed) {
      console.log(
        '\nNothing was deleted. Run "pnpm demo:reset --yes" to delete the above.',
      );
      return;
    }

    await Promise.all(
      collections.map((collection) => collection.deleteMany({})),
    );
    await rm(DEMO_UPLOADS_DIR, { recursive: true, force: true });

    console.log(
      '\nDemo data deleted. Run "pnpm demo:seed" to create it again.',
    );
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error: unknown) => {
  console.error(`[ reset ] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
