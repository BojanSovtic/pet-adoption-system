/**
 * Grants or revokes the admin role from the command line:
 *
 *   pnpm admin:grant <email>          # shows what would change (dry run)
 *   pnpm admin:grant <email> --yes    # applies it
 *   pnpm admin:revoke <email> --yes
 *
 * This is how the first admin is created: the person registers normally in
 * the app, then an operator with access to the server's environment (the
 * database credentials in MONGODB_URI) runs this. No password or account is
 * stored in the repository, and registration can never create an admin.
 *
 * It uses the same rules as the admin area (changeUserRole): the last admin
 * can't be revoked, and every change is written to the admin audit log with
 * source "cli".
 *
 * Settings: only MONGODB_URI is required (plus AUDIT_HMAC_KEY if the API uses
 * one, so the audit chain stays verifiable). They come from the environment
 * or apps/api/.env (run from the repository root). It deliberately doesn't
 * load the web server's configuration (config/env.ts), so SESSION_SECRET and
 * CORS_ORIGIN aren't needed.
 */
import { changeUserRole } from '../admin/user-role.service';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { loadEnvFile, readAuditKey, readMongodbUri } from '../config/env-file';
import { UserModel } from '../users/user.model';

type Command = { role: 'admin' | 'user'; email: string; apply: boolean };

const USAGE =
  'Usage: pnpm admin:grant <email> [--yes] | pnpm admin:revoke <email> [--yes]';

/** Parses `grant|revoke <email> [--yes]`. Exported for tests. */
export const parseAdminRoleArgs = (args: readonly string[]): Command => {
  const [action, ...rest] = args;
  const email = rest.find((arg) => !arg.startsWith('--'));
  const unknownFlags = rest.filter(
    (arg) => arg.startsWith('--') && arg !== '--yes',
  );

  if ((action !== 'grant' && action !== 'revoke') || !email) {
    throw new Error(USAGE);
  }

  if (unknownFlags.length > 0) {
    throw new Error(`Unknown option ${unknownFlags.join(', ')}. ${USAGE}`);
  }

  return {
    role: action === 'grant' ? 'admin' : 'user',
    email: email.trim().toLowerCase(),
    apply: rest.includes('--yes'),
  };
};

/** "host/database" without credentials, so the output is safe to share. */
const describeDatabase = (uri: string): string => {
  const url = new URL(uri);

  return `${url.host}${url.pathname}`;
};

const main = async () => {
  const { role, email, apply } = parseAdminRoleArgs(process.argv.slice(2));

  loadEnvFile();
  const mongodbUri = readMongodbUri();
  // Fail before connecting if a configured audit key is invalid.
  readAuditKey();

  await connectDatabase(mongodbUri);

  try {
    console.log(`Database: ${describeDatabase(mongodbUri)}`);

    const user = await UserModel.findOne({ email }).lean();

    if (!user) {
      throw new Error(
        `No user with the email ${email}. They must register in the app first.`,
      );
    }

    const currentRole = user.role ?? 'user';
    console.log(`User: ${user.name} <${user.email}>, role: ${currentRole}`);

    if (currentRole === role) {
      console.log(`Nothing to do: the role is already "${role}".`);
      return;
    }

    if (!apply) {
      console.log(
        `Would change the role to "${role}". Run again with --yes to apply.`,
      );
      return;
    }

    await changeUserRole({
      targetId: user._id.toString(),
      role,
      source: 'cli',
    });
    console.log(
      `Done: the role is now "${role}". It applies to the user's next request.`,
    );
  } finally {
    await disconnectDatabase();
  }
};

// Service errors carry a code as their message; explain the expected ones.
const EXPLANATIONS: Record<string, string> = {
  LAST_ADMIN:
    'This is the last admin. Grant the admin role to someone else first.',
  USER_SUSPENDED:
    'The account is suspended. Reinstate it in the admin area first.',
};

// Run only when executed directly (tests import parseAdminRoleArgs).
if (process.argv[1]?.includes('admin-role')) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ admin ] ${EXPLANATIONS[message] ?? message}`);
    process.exit(1);
  });
}
