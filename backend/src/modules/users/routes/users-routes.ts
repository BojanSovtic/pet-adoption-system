import express from "express";
import { body } from "express-validator";

import {
  getUsers,
  getUserById,
  getMyProfile,
  signup,
  login,
  updateProfile,
  addFavorite,
  removeFavorite,
  getFavorites,
} from "@/modules/users/controllers/users-controller";
import { validateRequest } from "@/shared/middleware/validate-request";
import auth from "@/shared/middleware/auth";
import { avatarUpload } from "../../../shared/middleware/file-upload";

const router = express.Router();

// Public routes
router.get("/", getUsers);
router.get("/:userId", getUserById);

// Auth routes
router.post(
  "/signup",
  avatarUpload,
  [
    body("name").trim().notEmpty().withMessage("Name is required."),
    body("email")
      .normalizeEmail()
      .isEmail()
      .withMessage("Valid email is required."),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters."),
    body("phone").optional().trim(),
    body("role")
      .optional()
      .isIn(["user", "shelter"])
      .withMessage("Invalid role."),
  ],
  validateRequest,
  signup
);

router.post(
  "/login",
  [
    body("email")
      .normalizeEmail()
      .isEmail()
      .withMessage("Valid email is required."),
    body("password").notEmpty().withMessage("Password is required."),
  ],
  validateRequest,
  login
);

// Protected routes (require authentication)
router.use(auth);

router.get("/profile/me", getMyProfile);

router.patch(
  "/profile",
  [
    body("name").optional().trim().notEmpty(),
    body("phone").optional().trim(),
    body("bio").optional().trim().isLength({ max: 500 }),
    body("avatar").optional().trim().isURL(),
  ],
  validateRequest,
  updateProfile
);

router.get("/favorites/list", getFavorites);
router.post("/favorites/:petId", addFavorite);
router.delete("/favorites/:petId", removeFavorite);

export default router;
