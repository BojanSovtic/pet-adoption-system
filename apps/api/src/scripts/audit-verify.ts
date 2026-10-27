/**
 * Checks the admin audit log's hash chain:
 *
 *   pnpm audit:verify
 *
 * Reports edited, deleted, inserted or reordered entries (see
 * verifyAuditChain). Needs MONGODB_URI and, if the API signs entries,
 * the same AUDIT_HMAC_KEY. Read-only. Exit code 1 when a problem is found,
 * so it can run on a schedule or in a deployment check.
 */
import { verifyAuditChain } from '../admin/admin-audit.service';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { loadEnvFile, readAuditKey, readMongodbUri } from '../config/env-file';

const main = async (): Promise<boolean> => {
  loadEnvFile();
  const mongodbUri = readMongodbUri();
  const keyed = Boolean(readAuditKey());

  await connectDatabase(mongodbUri);

  try {
    const { ok, entries, problems } = await verifyAuditChain();

    console.log(
      `Checked ${entries} audit entries (${keyed ? 'with' : 'without'} AUDIT_HMAC_KEY).`,
    );

    for (const problem of problems) {
      console.error(`  ✗ ${problem}`);
    }

    console.log(
      ok ? 'The audit chain is intact.' : 'The audit chain is BROKEN.',
    );

    return ok;
  } finally {
    await disconnectDatabase();
  }
};

main()
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((error: unknown) => {
    console.error(
      `[ audit ] ${error instanceof Error ? error.message : error}`,
    );
    process.exit(1);
  });
