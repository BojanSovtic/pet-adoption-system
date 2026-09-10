import { Router } from 'express';

import { validateBody } from '../middleware/validate';
import { createPetSchema } from './pet.schema';
import { createPetController } from './pet.controller';

export const petRouter: Router = Router();

petRouter.post('/', validateBody(createPetSchema), createPetController);
