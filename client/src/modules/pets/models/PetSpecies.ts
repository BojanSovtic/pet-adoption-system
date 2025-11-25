export const PetSpecies = ["dog", "cat", "bird", "rabbit", "other"] as const;
export type PetSpecies = (typeof PetSpecies)[number];
