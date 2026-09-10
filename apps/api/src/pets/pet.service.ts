import { PetModel, type Pet } from './pet.model';

export type CreatePetInput = {
  name: string;
  species: Pet['species'];
  age: number;
  description: string;
  imageUrls?: string[];
};

export const createPet = async (input: CreatePetInput): Promise<Pet> => {
  const pet = await PetModel.create(input);

  return pet.toObject();
};
