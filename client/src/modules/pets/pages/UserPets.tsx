import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Card } from "@mui/material";
import { RootState } from "@/store";
import { useSelector } from "react-redux";

import { PetDTO, PetView } from "../models/Pets";
import { petAPI } from "../services/pets-service";
import { dtoToPetView } from "../mappers/petsMapper";
import PetList from "../components/PetList/PetList";

function UserPets() {
  const [pets, setPets] = useState<PetView[]>();
  const { userId } = useParams<{ userId: string }>();

  const isLoading = useSelector(
    (state: RootState) => state.loading.counter > 0
  );

  useEffect(() => {
    const fetchPets = async () => {
      if (!userId) return;

      try {
        const pets = await petAPI.getPetsByUserId(userId);

        const mappedPets: PetView[] = pets.map((pet: PetDTO) =>
          dtoToPetView(pet)
        );

        setPets(mappedPets);
      } catch (err) {
        console.error("Failed to fetch pets:", err);
      }
    };

    fetchPets();
  }, [userId]);

  const deletePetHandler = (petId: string) => {
    setPets((prevPets) =>
      prevPets ? prevPets.filter((pet) => pet.id !== petId) : []
    );
  };

  return (
    <>
      {!isLoading && pets && pets.length > 0 && (
        <PetList items={pets} onDelete={deletePetHandler} />
      )}

      {!isLoading && (!pets || pets.length === 0) && (
        <Card sx={{ m: 5, textAlign: "center" }}>
          <h3>No pets found</h3>
        </Card>
      )}
    </>
  );
}

export default UserPets;
