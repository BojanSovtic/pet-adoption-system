import type {
  ApplicationStatus,
  CreatePetInput,
  PetSpecies,
} from '@pet-adoption/models';

/**
 * The demo dataset (users, pets, applications), shared by seed-demo and
 * prepare-demo-images. The manual QA cases refer to these records by name;
 * demo-data.spec.ts checks the facts they rely on.
 */

// `example.com` is reserved for examples, so these can't be real addresses.
export const USERS = {
  ana: { name: 'Ana Petrović', email: 'ana@demo.example.com' },
  marko: { name: 'Marko Jovanović', email: 'marko@demo.example.com' },
  jelena: { name: 'Jelena Nikolić', email: 'jelena@demo.example.com' },
  luka: { name: 'Luka Ilić', email: 'luka@demo.example.com' },
} as const;

export type UserKey = keyof typeof USERS;

/** A demo pet: the create input (profile facts included) plus its owner. */
export type PetSpec = CreatePetInput & {
  owner: UserKey;
  species: PetSpecies;
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
    sex: 'male',
    breed: 'Labrador mix',
    compatibility: { children: 'yes', dogs: 'yes', cats: 'unknown' },
    aloneTime: 'part-day',
  },
  {
    owner: 'ana',
    name: 'Maxi',
    species: 'dog',
    age: 1,
    description: 'Playful terrier puppy, learning to walk on a leash.',
    sex: 'male',
    breed: 'Jack Russell terrier',
    compatibility: { children: 'yes', dogs: 'yes', cats: 'no' },
    aloneTime: 'short',
  },
  {
    owner: 'ana',
    name: 'Bella',
    species: 'cat',
    age: 2,
    description: 'Calm tabby who enjoys sunny windowsills.',
    sex: 'female',
    breed: 'Tabby',
    compatibility: { children: 'yes', dogs: 'unknown', cats: 'yes' },
    aloneTime: 'full-day',
  },
  {
    owner: 'ana',
    name: 'Luna',
    species: 'cat',
    age: 5,
    description: 'Shy at first, very affectionate once she knows you.',
    sex: 'female',
    compatibility: { children: 'no', dogs: 'no', cats: 'yes' },
    aloneTime: 'full-day',
  },
  {
    owner: 'ana',
    name: 'Rex',
    species: 'dog',
    age: 7,
    description: 'Gentle German Shepherd, good with children.',
    sex: 'male',
    breed: 'German Shepherd',
    compatibility: { children: 'yes', dogs: 'yes', cats: 'no' },
    aloneTime: 'part-day',
  },
  {
    owner: 'ana',
    name: 'Mila',
    species: 'cat',
    age: 0,
    description: 'Curious kitten, litter-trained.',
    sex: 'female',
    compatibility: { children: 'yes', dogs: 'unknown', cats: 'yes' },
    aloneTime: 'short',
  },
  {
    owner: 'ana',
    name: 'Kiki',
    species: 'bird',
    age: 2,
    description: 'Talkative budgie who whistles in the morning.',
    sex: 'male',
    breed: 'Budgie',
    compatibility: { children: 'yes', dogs: 'unknown', cats: 'no' },
    aloneTime: 'full-day',
  },
  {
    owner: 'ana',
    name: 'Toby',
    species: 'dog',
    age: 10,
    description: 'Senior beagle looking for a quiet home.',
    sex: 'male',
    breed: 'Beagle',
    compatibility: { children: 'yes', dogs: 'yes', cats: 'yes' },
    aloneTime: 'part-day',
  },
  {
    owner: 'ana',
    name: 'Nala',
    species: 'cat',
    age: 4,
    description: 'Independent cat, happy as the only pet.',
    sex: 'female',
    compatibility: { children: 'no', dogs: 'no', cats: 'no' },
    aloneTime: 'full-day',
  },
  {
    owner: 'marko',
    name: 'Bello',
    species: 'dog',
    age: 6,
    description: 'Friendly mixed breed, house-trained.',
    sex: 'male',
    breed: 'Mixed breed',
    compatibility: { children: 'yes', dogs: 'yes', cats: 'unknown' },
    aloneTime: 'part-day',
  },
  {
    owner: 'marko',
    name: 'Coco',
    species: 'rabbit',
    age: 1,
    description: 'Gentle rabbit who likes fresh greens.',
    sex: 'female',
    breed: 'Netherland Dwarf',
    compatibility: { children: 'yes', dogs: 'no', cats: 'unknown' },
    aloneTime: 'part-day',
  },
  {
    owner: 'marko',
    name: 'Oscar',
    species: 'cat',
    age: 12,
    description: 'Relaxed senior cat who loves naps.',
    sex: 'male',
    compatibility: { children: 'yes', dogs: 'unknown', cats: 'yes' },
    aloneTime: 'full-day',
  },
  {
    owner: 'marko',
    name: 'Daisy',
    species: 'dog',
    age: 2,
    description: 'Small poodle mix with lots of energy.',
    sex: 'female',
    breed: 'Poodle mix',
    compatibility: { children: 'unknown', dogs: 'yes', cats: 'unknown' },
    aloneTime: 'short',
  },
  {
    owner: 'marko',
    name: 'Pip',
    species: 'rodent',
    age: 0,
    description: 'Young hamster, active in the evenings.',
    sex: 'unknown',
    breed: 'Syrian hamster',
    compatibility: { children: 'no', dogs: 'no', cats: 'no' },
    aloneTime: 'full-day',
  },
];

/** `autoRejected`: ends rejected because another application was accepted. */
export type Outcome = ApplicationStatus | 'autoRejected';

/** A demo application: who applies for which pet, and how it ends. */
export type ApplicationSpec = {
  pet: string;
  applicant: UserKey;
  outcome: Outcome;
};

// All applications are submitted before any decision, so the order here
// doesn't matter; an accept auto-rejects the other applications for its pet.
// Ana receives 11 applications: more than one page (10 per page).
export const APPLICATIONS: ApplicationSpec[] = [
  { pet: 'Max', applicant: 'jelena', outcome: 'pending' },
  { pet: 'Maxi', applicant: 'jelena', outcome: 'accepted' },
  { pet: 'Maxi', applicant: 'luka', outcome: 'autoRejected' },
  { pet: 'Bella', applicant: 'luka', outcome: 'rejected' },
  { pet: 'Luna', applicant: 'jelena', outcome: 'withdrawn' },
  { pet: 'Rex', applicant: 'luka', outcome: 'pending' },
  { pet: 'Rex', applicant: 'marko', outcome: 'pending' },
  { pet: 'Mila', applicant: 'marko', outcome: 'pending' },
  { pet: 'Kiki', applicant: 'jelena', outcome: 'pending' },
  { pet: 'Toby', applicant: 'luka', outcome: 'pending' },
  { pet: 'Nala', applicant: 'jelena', outcome: 'pending' },
  { pet: 'Oscar', applicant: 'luka', outcome: 'accepted' },
  { pet: 'Pip', applicant: 'jelena', outcome: 'pending' },
];

/** The message every demo application is sent with. */
export const applicationMessage = (petName: string): string =>
  `Hello! I would love to give ${petName} a loving home. I have experience with pets and time to care for them.`;

/** The owner's reason for every demo rejection (a reason is required). */
export const rejectionReason = (petName: string): string =>
  `Thank you for your interest in ${petName}. We are looking for a home with more experience with this kind of pet.`;
