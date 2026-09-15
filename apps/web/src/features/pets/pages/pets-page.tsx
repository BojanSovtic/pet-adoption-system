import { useQuery } from '@tanstack/react-query';

import { getPets } from '../api/get-pets';
import { PetCard } from '../components/pet-card';

export const PetsPage = () => {
  const {
    data: pets,
    isPending,
    isError,
  } = useQuery({
    queryKey: ['pets'],
    queryFn: getPets,
  });

  if (isPending) {
    return <p>Loading pets...</p>;
  }

  if (isError) {
    return <p>Failed to load pets.</p>;
  }

  if (pets.length === 0) {
    return <p>No pets are currently available.</p>;
  }

  return (
    <main>
      <h1>Available pets</h1>

      {pets.map((pet) => (
        <PetCard key={pet._id} pet={pet} />
      ))}
    </main>
  );
};
