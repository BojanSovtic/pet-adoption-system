import { app } from './app';
import { backfillApplicationPetOwners } from './applications/application.service';
import { connectDatabase, disconnectDatabase } from './config/database';
import { backfillPetImages } from './pets/pet.service';
import { env } from './config/env';

const bootstrap = async () => {
  await connectDatabase(env.mongodbUri);

  // One-time data fix for applications created before `petOwner` existed.
  const backfilled = await backfillApplicationPetOwners();

  if (backfilled > 0) {
    console.log(`[ database ] Added petOwner to ${backfilled} application(s)`);
  }

  // One-time data fix for pets saved with a single `imageKey`.
  const convertedPets = await backfillPetImages();

  if (convertedPets > 0) {
    console.log(`[ database ] Moved ${convertedPets} pet photo(s) into images`);
  }

  const server = app.listen(env.port, env.host, () => {
    console.log(`[ ready ] http://${env.host}:${env.port}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[ shutdown ] Received ${signal}`);

    server.close(async () => {
      console.log('[ shutdown ] HTTP server closed');

      await disconnectDatabase();

      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

bootstrap().catch((error) => {
  console.error('[ startup ] Failed to start application', error);
  process.exit(1);
});
