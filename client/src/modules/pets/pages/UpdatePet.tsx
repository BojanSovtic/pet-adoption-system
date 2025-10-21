import { useState, useEffect, useContext } from "react";
import { useParams, useHistory } from "react-router-dom";

import classes from "./PetForm.module.css";
import { AuthContext, AuthContextType } from "@/contexts/auth-context";
import useHttp from "@/hooks/http-hook";
import useForm from "@/hooks/form-hook";
import LoadingSpinner from "@/components/UI/LoadingSpinner/LoadingSpinner";
import Card from "@/components/UI/Card/Card";
import Input from "@/components/FormElements/Input/Input";
import {
  VALIDATOR_MIN,
  VALIDATOR_MINLENGTH,
  VALIDATOR_REQUIRE,
} from "@/utils/validators";
import Button from "@/components/FormElements/Button/Button";
import { ErrorModal } from "@/components/UI/ErrorModal/ErrorModal";

const UpdatePet = () => {
  const history = useHistory();
  const petId = useParams<{ petId: string }>().petId;
  const authContext = useContext<AuthContextType>(AuthContext);
  const { isLoading, error, sendRequest, clearError } = useHttp();
  const [pet, setPet] = useState<any>();

  const [formState, inputHandler, setFormData] = useForm(
    {
      name: { value: "", isValid: false },
      species: { value: "", isValid: false },
      age: { value: null, isValid: false },
      description: { value: "", isValid: false },
    },
    true
  );

  useEffect(() => {
    async function fetchPet() {
      try {
        const data = await sendRequest(
          `${import.meta.env.VITE_BACKEND_URL}/pets/${petId}`
        );

        setPet(data.pet);

        setFormData(
          {
            name: {
              value: data.pet.name,
              isValid: true,
            },
            species: {
              value: data.pet.species,
              isValid: true,
            },
            age: {
              value: data.pet.age,
              isValid: true,
            },
            description: {
              value: data.pet.description,
              isValid: true,
            },
          },
          true
        );
      } catch (err) {
        console.error(err);
      }
    }

    fetchPet();
  }, [setFormData, sendRequest, petId]);

  async function petUpdateSubmitHandler(event: React.FormEvent) {
    event.preventDefault();

    if (!formState.isValid) {
      return;
    }

    const name = formState.inputs.name?.value;
    const species = formState.inputs.species?.value;
    const age = formState.inputs.age?.value;
    const description = formState.inputs.description?.value;

    try {
      await sendRequest(
        `${import.meta.env.VITE_BACKEND_URL}/pets/${petId}`,
        "PATCH",
        JSON.stringify({
          name: name,
          species: species,
          age: age,
          description: description,
        }),
        {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authContext.token}`,
        }
      );

      history.push(`/${authContext.userId}/pets`);
    } catch (err) {
      console.error(err);
    }
  }

  if (isLoading) {
    return (
      <div className="center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!pet && !error) {
    return (
      <div className="center">
        <Card>
          <h2>Could not find pet!</h2> {/* Updated message */}
        </Card>
      </div>
    );
  }

  return (
    <>
      <ErrorModal open={!!error} error={error} onClose={clearError} />
      {!isLoading && pet && (
        <form className={classes["pet-form"]} onSubmit={petUpdateSubmitHandler}>
          <Input
            id="name"
            element="input"
            type="text"
            label="Pet Name"
            validators={[VALIDATOR_REQUIRE()]}
            errorText="Please enter a valid name!"
            initValue={pet.name}
            initValid={true}
            onInput={inputHandler}
          />

          <Input
            id="species"
            element="input"
            type="text"
            label="Species (e.g., Dog, Cat, Bird)"
            validators={[VALIDATOR_REQUIRE()]}
            errorText="Please enter the species!"
            initValue={pet.species}
            initValid={true}
            onInput={inputHandler}
          />

          <Input
            id="age"
            element="input"
            type="number"
            label="Age (Years)"
            validators={[VALIDATOR_MIN(0)]}
            errorText="Age must be 0 or greater!"
            initValue={pet.age.toString()}
            initValid={true}
            onInput={inputHandler}
          />

          <Input
            id="description"
            element="textarea"
            label="Description"
            validators={[VALIDATOR_MINLENGTH(10)]}
            errorText="At least ten characters!"
            initValue={pet.description}
            initValid={true}
            onInput={inputHandler}
          />

          <Button type="submit" disabled={!formState.isValid}>
            Update Pet
          </Button>
        </form>
      )}
    </>
  );
};

export default UpdatePet;
