import { PetDTO, PetView } from "../models/Pets";

export const dtoToPetView = (petDTO: PetDTO): PetView => {
  return {
    id: petDTO.id,
    name: petDTO.name,
    species: petDTO.species,
    breed: petDTO.breed,
    age: petDTO.age,
    description: petDTO.description,
    images: petDTO.images,
    status: petDTO.status,
  };
};
