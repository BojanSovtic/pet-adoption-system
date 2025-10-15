import { Request, Response } from 'express';

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { HttpError } from '@/shared/models/http-error';
import User, { IUser } from '@/modules/users/models/User';

// --- Type Definitions for Request Body ---
// Define the expected structure for the login request body
interface LoginBody {
  email?: string;
  password?: string;
}

// Define the expected structure for the signup request body
interface SignupBody extends LoginBody {
  name?: string;
}
// ----------------------------------------

// GET /api/users
export const getUsers = async (req: Request, res: Response) => {
  // We don't need a try/catch block here; asyncHandler will catch any
  // Mongoose errors (e.g., connection failure) and pass them to the error handler.

  // The second argument, '-password', tells Mongoose to exclude the password field.
  const users = await User.find({}, '-password'); 

  // Check if no users were found (though an empty array is usually fine)
  if (!users) {
    // This is technically unlikely unless the DB is completely inaccessible, 
    // but included for robust error handling.
    throw new HttpError("Couldn't retrieve users!", 500); 
  }

  res.status(200).json({
    // .map(user => user.toObject({ getters: true })) converts Mongoose documents 
    // into plain objects and applies any virtual getters (like id/public fields).
    users: users.map((user) => user.toObject({ getters: true })),
  });
};

// POST /api/users/signup
// Use the custom type for req.body
export const signup = async (req: Request<{}, {}, SignupBody>, res: Response) => { 
  // Validation is assumed to have passed thanks to validateRequest middleware

  const { name, email, password } = req.body;
  
  // 1. Check for existing user (Let asyncHandler catch Mongoose errors)
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new HttpError('Email already in use.', 422);
  }

  // 2. Hash password (Let asyncHandler catch bcrypt errors)
  // Ensure required fields are present before operation (though validateRequest should cover this)
  if (!password) throw new HttpError('Password is required.', 422); 
  const hashedPassword = await bcrypt.hash(password, 12);

  const createdUser = new User({
    name,
    email,
    password: hashedPassword,
    pets: [],
  });

  // 3. Save user (Let asyncHandler catch Mongoose errors)
  await createdUser.save(); 

  // 4. Generate token
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new HttpError('Server configuration error.', 500); // Fail safe check

  const token = jwt.sign(
    { userId: createdUser.id, email: createdUser.email },
    secret, // Use the secure secret
    { expiresIn: '1h' }
  );

  res.status(201).json({
    userId: createdUser.id,
    email: createdUser.email,
    token,
  });
};


// POST /api/users/login
export const login = async (req: Request<{}, {}, LoginBody>, res: Response) => {
  const { email, password } = req.body;

  // 1. Find user
  const existingUser = await User.findOne({ email });
  if (!existingUser) {
    // Keep this generic to avoid giving away if the email exists
    throw new HttpError('Invalid credentials.', 403); 
  }

  // 2. Compare password
  if (!password) throw new HttpError('Password is required.', 422); 
  const isPasswordValid = await bcrypt.compare(password, existingUser.password);
  
  if (!isPasswordValid) {
    throw new HttpError('Invalid credentials.', 403);
  }
  
  // 3. Generate token
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new HttpError('Server configuration error.', 500);

  const token = jwt.sign(
    { userId: existingUser.id, email: existingUser.email },
    secret,
    { expiresIn: '1h' }
  );

  res.status(200).json({
    userId: existingUser.id,
    email: existingUser.email,
    token,
  });
};