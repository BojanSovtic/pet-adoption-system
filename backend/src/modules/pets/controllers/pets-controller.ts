import { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import fs from 'fs';
import path from 'path';

import { HttpError } from '@/shared/models/http-error';
import { AuthRequest } from '@/shared/interfaces/auth';
import Pet from '@/modules/pets/models/Pet';
import User, { IUser } from '@/modules/users/models/User';

// GET /api/pets
export const getPets = async (req: Request, res: Response) => {
  const pets = await Pet.find()
    .populate('owner', 'name email')
    .populate('adopter', 'name email')
    .sort({ createdAt: -1 });

  res.status(200).json({ pets: pets.map(pet => pet.toObject({ getters: true })) });
};


// GET /api/pets/:id
export const getPetById = async (req: Request, res: Response) => {
  const pet = await Pet.findById(req.params.id)
    .populate('owner', 'name email')
    .populate('adopter', 'name email');

  if (!pet) throw new HttpError('Pet not found.', 404);

  res.status(200).json({ pet: pet.toObject({ getters: true }) }); 
};


// POST /api/pets - create pet (auth required)
export const createPet = async (req: AuthRequest, res: Response) => {
const { name, species, breed, age, description } = req.body;
const rawFiles = req.files; 

let files: Express.Multer.File[] = [];

if (Array.isArray(rawFiles)) {
  files = rawFiles;
} else if (rawFiles && typeof rawFiles === 'object') {
  files = Object.values(rawFiles).reduce<Express.Multer.File[]>(
    (acc, arr) => acc.concat(arr),
    []
  );
}

  const photos = files ? files.map(f => `/uploads/${f.filename}`) : [];
  const ownerId = req.user?.id; // Owner ID comes from auth middleware

  if (!ownerId) throw new HttpError('Authentication required.', 401);

  const pet = new Pet({ name, species, breed, age, description, photos, owner: ownerId });

  const user = await User.findById(ownerId);
  if (!user) throw new HttpError('Owner not found.', 404);

  const session = await Pet.startSession();
  session.startTransaction();
  try {
    await pet.save({ session });

    user.pets.push(pet._id as Types.ObjectId); 
    await user.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({ pet: pet.toObject({ getters: true }) }); 
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    throw new HttpError('Creating pet failed, please try again.', 500); 
  }
};


// PUT /api/pets/:id/adopt (auth required)
export const adoptPet = async (req: AuthRequest, res: Response) => {
  const pet = await Pet.findById(req.params.id);
  
  if (!pet) throw new HttpError('Pet not found.', 404);
  if (pet.status === 'adopted') throw new HttpError('Pet already adopted.', 400);

  const adopterId = req.user?.id;
  if (!adopterId) throw new HttpError('No user for adoption found.', 400); 

  pet.status = 'adopted';
  pet.adopter = adopterId as unknown as mongoose.Types.ObjectId; 

  await pet.save();
  res.status(200).json({ pet: pet.toObject({ getters: true }) });
};


// DELETE /api/pets/:id (auth required)
export const deletePet = async (req: AuthRequest, res: Response) => {
  const pet = await Pet.findById(req.params.id).populate<{ owner: IUser }>('owner');
  
  if (!pet) throw new HttpError('Pet not found.', 404);
  if (!pet.owner) throw new HttpError('Pet owner not found.', 404);

  if (pet.owner.id !== req.user?.id) 
    throw new HttpError("You can't delete pets you don't own.", 401);

  const session = await Pet.startSession();
  session.startTransaction();
  try {
    await pet.deleteOne({ session });

    const owner = pet.owner; 
    owner.pets.pull(pet._id);
    await owner.save({ session });

    await session.commitTransaction();
    session.endSession();
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw new HttpError('Deleting pet failed.', 500);
  }

  pet.photos.forEach((photo) => {
    const filePath = path.join(__dirname, '..', '..', '..', photo); 
    
    fs.unlink(filePath, (err) => {
      if (err) console.error(`Failed to delete file ${filePath}:`, err);
    });
  });

  res.status(200).json({ message: 'Pet deleted successfully.' });
};