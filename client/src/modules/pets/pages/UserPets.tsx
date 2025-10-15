import ErrorModal from "@/components/UI/ErrorModal/ErrorModal";
import LoadingSpinner from "@/components/UI/LoadingSpinner/LoadingSpinner";
import useHttp from "@/hooks/http-hook";
import{ useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import PetList from "../components/PetList/PetList";

function UserPets() {
  const { isLoading, error, sendRequest, clearError } = useHttp();
  const [pets, setPets] = useState<any[] | undefined>(); 
  const { userId } = useParams<{ userId: string }>();

  useEffect(() => {
    async function fetchPets() {
      if (!userId) return; 
      try {
        const data = await sendRequest(
          `${import.meta.env.VITE_BACKEND_URL}/pets/user/${userId}`
        );

        setPets(data.pets);
      } catch (err) {
        console.error(err);
      }
    }

    fetchPets();
  }, [sendRequest, userId]);


  function deletePetHandler(petId: string) {
    setPets((prevPets) =>
      prevPets ? prevPets.filter((pet) => pet.id !== petId) : []
    );
  }

  return (
    <>
      <ErrorModal error={error} onClear={clearError} />
      {isLoading && (
        <div className="center">
          <LoadingSpinner />
        </div>
      )}
      {!isLoading && pets && (
        <PetList items={pets} onDelete={deletePetHandler} />
      )}
    </>
  );
}

export default UserPets;
