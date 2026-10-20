import mongoose, { type ClientSession } from 'mongoose';

export const connectDatabase = async (uri: string): Promise<void> => {
  await mongoose.connect(uri);

  // Adoption decisions use transactions, which a standalone server rejects.
  // Failing at startup is clearer than a 500 on the first acceptance.
  const hello = await mongoose.connection.db?.admin().command({ hello: 1 });

  if (!hello?.setName) {
    throw new Error(
      'MongoDB must run as a replica set (transactions are required). ' +
        'See "Local MongoDB" in docs/progress.md.',
    );
  }

  console.log('[ database ] MongoDB connected');
};

export const disconnectDatabase = async (): Promise<void> => {
  await mongoose.disconnect();
  console.log('[ database ] MongoDB disconnected');
};

/**
 * Runs `work` in a MongoDB transaction: all writes commit together or none do.
 * Pass `{ session }` to every query inside. Transient errors (e.g. a write
 * conflict with a concurrent transaction) make MongoDB retry `work`, so it
 * must not have side effects outside the database.
 */
export const withTransaction = <T>(
  work: (session: ClientSession) => Promise<T>,
): Promise<T> => mongoose.connection.transaction(work);
