import { argon2id, hash, verify } from 'argon2';

// argon2's defaults (64 MiB memory, 3 iterations, 4 lanes) exceed the OWASP
// minimum for Argon2id; the parameters are stored inside each hash string.
export const hashPassword = (password: string): Promise<string> =>
  hash(password, { type: argon2id });

export const verifyPassword = (
  passwordHash: string,
  password: string,
): Promise<boolean> => verify(passwordHash, password);
