import type { PetSpecies } from '@pet-adoption/models';

/** The demo users and pets, shared by seed-demo and prepare-demo-images. */

// `example.com` is reserved for examples, so these can't be real addresses.
export const USERS = {
  ana: { name: 'Ana Petrović', email: 'ana@demo.example.com' },
  marko: { name: 'Marko Jovanović', email: 'marko@demo.example.com' },
  jelena: { name: 'Jelena Nikolić', email: 'jelena@demo.example.com' },
  luka: { name: 'Luka Ilić', email: 'luka@demo.example.com' },
} as const;

export type UserKey = keyof typeof USERS;

export type PetSpec = {
  owner: UserKey;
  name: string;
  species: PetSpecies;
  age: number;
  description: string;
};

// 14 pets: more than one page of the pet list (12 per page). Similar names
// (Max/Maxi, Bella/Bello) make search easy to show.
export const PETS: PetSpec[] = [
  {
    owner: 'ana',
    name: 'Max',
    species: 'dog',
    age: 3,
    description: 'Energetic Labrador mix who loves fetch and long walks.',
  },
  {
    owner: 'ana',
    name: 'Maxi',
    species: 'dog',
    age: 1,
    description: 'Playful terrier puppy, learning to walk on a leash.',
  },
  {
    owner: 'ana',
    name: 'Bella',
    species: 'cat',
    age: 2,
    description: 'Calm tabby who enjoys sunny windowsills.',
  },
  {
    owner: 'ana',
    name: 'Luna',
    species: 'cat',
    age: 5,
    description: 'Shy at first, very affectionate once she knows you.',
  },
  {
    owner: 'ana',
    name: 'Rex',
    species: 'dog',
    age: 7,
    description: 'Gentle German Shepherd, good with children.',
  },
  {
    owner: 'ana',
    name: 'Mila',
    species: 'cat',
    age: 0,
    description: 'Curious kitten, litter-trained.',
  },
  {
    owner: 'ana',
    name: 'Kiki',
    species: 'other',
    age: 2,
    description: 'Talkative budgie who whistles in the morning.',
  },
  {
    owner: 'ana',
    name: 'Toby',
    species: 'dog',
    age: 10,
    description: 'Senior beagle looking for a quiet home.',
  },
  {
    owner: 'ana',
    name: 'Nala',
    species: 'cat',
    age: 4,
    description: 'Independent cat, happy as the only pet.',
  },
  {
    owner: 'marko',
    name: 'Bello',
    species: 'dog',
    age: 6,
    description: 'Friendly mixed breed, house-trained.',
  },
  {
    owner: 'marko',
    name: 'Coco',
    species: 'other',
    age: 1,
    description: 'Gentle rabbit who likes fresh greens.',
  },
  {
    owner: 'marko',
    name: 'Oscar',
    species: 'cat',
    age: 12,
    description: 'Relaxed senior cat who loves naps.',
  },
  {
    owner: 'marko',
    name: 'Daisy',
    species: 'dog',
    age: 2,
    description: 'Small poodle mix with lots of energy.',
  },
  {
    owner: 'marko',
    name: 'Pip',
    species: 'other',
    age: 0,
    description: 'Young hamster, active in the evenings.',
  },
];
