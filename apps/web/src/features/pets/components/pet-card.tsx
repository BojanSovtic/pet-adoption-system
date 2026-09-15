import { Pet } from '../api/get-pets';

type PetCardProps = {
  pet: Pet;
};

export const PetCard = ({ pet }: PetCardProps) => {
  return (
    <article>
      <h2>{pet.name}</h2>

      <p>
        {pet.species} · {pet.age} years old
      </p>

      <p>{pet.description}</p>
    </article>
  );
};
