import type { Pet } from '@pet-adoption/models';

export type SpeciesFilter = 'all' | Pet['species'];
export type StatusFilter = 'all' | Pet['status'];

type FilterPetsOptions = {
  pets: Pet[];
  search: string;
  species: SpeciesFilter;
  status: StatusFilter;
};

export const filterPets = ({
  pets,
  search,
  species,
  status,
}: FilterPetsOptions): Pet[] => {
  const normalizedSearch = search.trim().toLocaleLowerCase();

  return pets.filter((pet) => {
    const matchesSearch = pet.name
      .toLocaleLowerCase()
      .includes(normalizedSearch);

    const matchesSpecies = species === 'all' || pet.species === species;

    const matchesStatus = status === 'all' || pet.status === status;

    return matchesSearch && matchesSpecies && matchesStatus;
  });
};
