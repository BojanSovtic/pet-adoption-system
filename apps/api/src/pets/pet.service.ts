import { PetModel, type Pet } from './pet.model';

export type CreatePetInput = {
  name: string;
  species: Pet['species'];
  age: number;
  description: string;
  imageUrls?: string[];
};

export type UpdatePetInput = Partial<CreatePetInput>;

export const getPets = async (): Promise<Pet[]> => {
  return PetModel.find().sort({ createdAt: -1 }).lean();
};

export const getPetById = async (id: string): Promise<Pet | null> => {
  return PetModel.findById(id).lean();
};

export const createPet = async (input: CreatePetInput): Promise<Pet> => {
  const pet = await PetModel.create(input);

  return pet.toObject();
};

export const updatePet = async (
  id: string,
  input: UpdatePetInput,
): Promise<Pet | null> => {
  return PetModel.findByIdAndUpdate(id, input, {
    new: true,
    runValidators: true,
  }).lean();
};
