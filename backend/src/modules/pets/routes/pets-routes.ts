import { Router } from "express";
import asyncHandler from "express-async-handler";

import auth from "@/shared/middleware/auth";
import * as petsController from "@/modules/pets/controllers/pets-controller";
import { petUpload } from "@/shared/middleware/file-upload";

const router = Router();

router.get("/user/:userId", asyncHandler(petsController.getPetsByUserId));
router.get("/:id", asyncHandler(petsController.getPetById));
router.get("/", asyncHandler(petsController.getPets));
router.post("/", auth, petUpload, asyncHandler(petsController.createPet));
router.put("/:id/adopt", auth, asyncHandler(petsController.adoptPet));
router.delete("/:id", auth, asyncHandler(petsController.deletePet));

export default router;
