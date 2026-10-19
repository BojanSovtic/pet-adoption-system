import { describe, expect, it } from 'vitest';

import type { Pet } from '../api/get-pets';
import { filterPets } from './filter-pets';

const pets: Pet[] = [
  {
    _id: '1',
    name: 'Buddy',
    species: 'dog',
    age: 3,
    description: 'A friendly dog.',
    status: 'available',
    imageUrls: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    _id: '2',
    name: 'Luna',
    species: 'cat',
    age: 2,
    description: 'A playful cat.',
    status: 'pending',
    imageUrls: [],
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
  {
    _id: '3',
    name: 'Max',
    species: 'dog',
    age: 5,
    description: 'A calm older dog.',
    status: 'adopted',
    imageUrls: [],
    createdAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
  },
];

describe('filterPets', () => {
  it('returns all pets when no filters are active', () => {
    expect(
      filterPets({
        pets,
        search: '',
        species: 'all',
        status: 'all',
      }),
    ).toEqual(pets);
  });

  it('searches by name without case sensitivity', () => {
    const result = filterPets({
      pets,
      search: 'bUd',
      species: 'all',
      status: 'all',
    });

    expect(result.map((pet) => pet.name)).toEqual(['Buddy']);
  });

  it('trims whitespace from the search term', () => {
    const result = filterPets({
      pets,
      search: '  luna  ',
      species: 'all',
      status: 'all',
    });

    expect(result.map((pet) => pet.name)).toEqual(['Luna']);
  });

  it('filters by species', () => {
    const result = filterPets({
      pets,
      search: '',
      species: 'dog',
      status: 'all',
    });

    expect(result.map((pet) => pet.name)).toEqual(['Buddy', 'Max']);
  });

  it('filters by status', () => {
    const result = filterPets({
      pets,
      search: '',
      species: 'all',
      status: 'pending',
    });

    expect(result.map((pet) => pet.name)).toEqual(['Luna']);
  });

  it('combines search, species, and status filters', () => {
    const result = filterPets({
      pets,
      search: 'ma',
      species: 'dog',
      status: 'adopted',
    });

    expect(result.map((pet) => pet.name)).toEqual(['Max']);
  });

  it('returns an empty array when nothing matches', () => {
    const result = filterPets({
      pets,
      search: 'nonexistent',
      species: 'all',
      status: 'all',
    });

    expect(result).toEqual([]);
  });

  it('does not modify the original pets array', () => {
    const originalPets = [...pets];

    filterPets({
      pets,
      search: 'a',
      species: 'dog',
      status: 'all',
    });

    expect(pets).toEqual(originalPets);
  });
});
