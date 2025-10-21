import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { HttpError } from "@/shared/models/http-error";
import User from "@/modules/users/models/User";

interface LoginBody {
  email?: string;
  password?: string;
}
interface SignupBody extends LoginBody {
  name?: string;
  phone?: string;
  role?: "user" | "shelter";
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
}
interface UpdateProfileBody {
  name?: string;
  phone?: string;
  bio?: string;
  avatar?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
}
interface AuthRequest extends Request {
  userData?: {
    userId: string;
    email: string;
  };
}

// GET /api/users - Get all users (public profiles)
export const getUsers = async (req: Request, res: Response) => {
  const users = await User.find({ isActive: true })
    .select("name email avatar bio role pets favoritePets adoptionApplications") // exclude timestamps and password fields
    .sort({ createdAt: -1 });

  if (!users) {
    throw new HttpError("Couldn't retrieve users!", 500);
  }

  const cleanedUsers = users.map((user) => {
    const obj = user.toJSON();
    return obj;
  });

  res.status(200).json({ users: cleanedUsers });
};

// GET /api/users/:userId - Get user by ID with pets
export const getUserById = async (req: Request, res: Response) => {
  const { userId } = req.params;

  const user = await User.findById(userId)
    .select("-password -resetPasswordToken -resetPasswordExpires")
    .populate("pets", "name species breed photos status");

  if (!user) {
    throw new HttpError("User not found.", 404);
  }

  res.status(200).json({
    user: user.toObject({ getters: true }),
  });
};

// GET /api/users/profile/me - Get current user's profile (authenticated)
export const getMyProfile = async (req: AuthRequest, res: Response) => {
  const userId = req.userData?.userId;

  if (!userId) {
    throw new HttpError("Not authenticated.", 401);
  }

  const user = await User.findById(userId)
    .select("-password -resetPasswordToken -resetPasswordExpires")
    .populate("pets")
    .populate("favoritePets", "name species breed photos status")
    .populate("adoptionApplications");

  if (!user) {
    throw new HttpError("User not found.", 404);
  }

  res.status(200).json({
    user: user.toObject({ getters: true }),
  });
};

// POST /api/users/signup
export const signup = async (
  req: Request<{}, {}, SignupBody>,
  res: Response
) => {
  const { name, email, password, phone, role, address } = req.body;

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new HttpError("Email already in use.", 422);
  }

  if (!password || !name) {
    throw new HttpError("Name and password are required.", 422);
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const createdUser = new User({
    name,
    email,
    password: hashedPassword,
    phone,
    role: role || "user",
    address,
    avatar: req.file ? `/uploads/avatars/${req.file.filename}` : null,
    pets: [],
    favoritePets: [],
    adoptionApplications: [],
  });

  await createdUser.save();

  const secret = process.env.JWT_SECRET;
  if (!secret) throw new HttpError("Server configuration error.", 500);

  const token = jwt.sign(
    {
      userId: createdUser.id,
      email: createdUser.email,
      role: createdUser.role,
    },
    secret,
    { expiresIn: "7d" }
  );

  res.status(201).json({
    userId: createdUser.id,
    email: createdUser.email,
    name: createdUser.name,
    role: createdUser.role,
    token,
  });
};

// POST /api/users/login
export const login = async (req: Request<{}, {}, LoginBody>, res: Response) => {
  const { email, password } = req.body;

  const existingUser = await User.findOne({ email }).select("+password");

  if (!existingUser) {
    throw new HttpError("Invalid credentials.", 403);
  }

  if (!existingUser.isActive) {
    throw new HttpError("Account is deactivated. Please contact support.", 403);
  }

  if (!password) throw new HttpError("Password is required.", 422);
  const isPasswordValid = await bcrypt.compare(password, existingUser.password);

  if (!isPasswordValid) {
    throw new HttpError("Invalid credentials.", 403);
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) throw new HttpError("Server configuration error.", 500);

  const token = jwt.sign(
    {
      userId: existingUser.id,
      email: existingUser.email,
      role: existingUser.role,
    },
    secret,
    { expiresIn: "7d" }
  );

  res.status(200).json({
    userId: existingUser.id,
    email: existingUser.email,
    name: existingUser.name,
    role: existingUser.role,
    avatar: existingUser.avatar,
    token,
  });
};

// PATCH /api/users/profile - Update user profile (authenticated)
export const updateProfile = async (req: AuthRequest, res: Response) => {
  const userId = req.userData?.userId;
  const updates: UpdateProfileBody = req.body;

  if (!userId) {
    throw new HttpError("Not authenticated.", 401);
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new HttpError("User not found.", 404);
  }

  if (updates.name) user.name = updates.name;
  if (updates.phone) user.phone = updates.phone;
  if (updates.bio) user.bio = updates.bio;
  if (updates.avatar) user.avatar = updates.avatar;
  if (updates.address) {
    user.address = {
      ...user.address,
      ...updates.address,
    };
  }

  await user.save();

  res.status(200).json({
    user: user.toObject({ getters: true }),
  });
};

// POST /api/users/favorites/:petId - Add pet to favorites
export const addFavorite = async (req: AuthRequest, res: Response) => {
  const userId = req.userData?.userId;
  const { petId } = req.params;

  if (!userId) {
    throw new HttpError("Not authenticated.", 401);
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new HttpError("User not found.", 404);
  }

  if (user.favoritePets.includes(petId as any)) {
    throw new HttpError("Pet already in favorites.", 400);
  }

  user.favoritePets.push(petId as any);
  await user.save();

  res.status(200).json({
    message: "Pet added to favorites.",
    favoritePets: user.favoritePets,
  });
};

// DELETE /api/users/favorites/:petId - Remove pet from favorites
export const removeFavorite = async (req: AuthRequest, res: Response) => {
  const userId = req.userData?.userId;
  const { petId } = req.params;

  if (!userId) {
    throw new HttpError("Not authenticated.", 401);
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new HttpError("User not found.", 404);
  }

  user.favoritePets = user.favoritePets.filter(
    (id) => id.toString() !== petId
  ) as any;

  await user.save();

  res.status(200).json({
    message: "Pet removed from favorites.",
    favoritePets: user.favoritePets,
  });
};

// GET /api/users/favorites - Get user's favorite pets
export const getFavorites = async (req: AuthRequest, res: Response) => {
  const userId = req.userData?.userId;

  if (!userId) {
    throw new HttpError("Not authenticated.", 401);
  }

  const user = await User.findById(userId).populate(
    "favoritePets",
    "name species breed photos status location owner"
  );

  if (!user) {
    throw new HttpError("User not found.", 404);
  }

  res.status(200).json({
    favorites: user.favoritePets,
  });
};
