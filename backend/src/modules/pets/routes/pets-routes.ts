import { Request, RequestHandler, Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import asyncHandler from 'express-async-handler';

import auth from '@/shared/middleware/auth';
import * as petsController from '@/modules/pets/controllers/pets-controller';

const router = Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', '..', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '_' + file.originalname.replace(/\s+/g, '_'));
  }
});
const upload = multer({ storage });

router.get('/', asyncHandler(petsController.getPets));
router.get('/:id', asyncHandler(petsController.getPetById));
router.post('/', auth, upload.array('photos', 6), asyncHandler(petsController.createPet)); 
router.put('/:id/adopt', auth, asyncHandler(petsController.adoptPet));
router.delete('/:id', auth, asyncHandler(petsController.deletePet));

export default router;
