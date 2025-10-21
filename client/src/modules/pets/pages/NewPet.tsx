import React, { useContext } from "react";
import { useHistory } from "react-router-dom";

import classes from "./PetForm.module.css";
import { AuthContext, AuthContextType } from "@/contexts/auth-context";
import useHttp from "@/hooks/http-hook";
import useForm from "@/hooks/form-hook";
import LoadingSpinner from "@/components/UI/LoadingSpinner/LoadingSpinner";
import Input from "@/components/FormElements/Input/Input";
import {
  VALIDATOR_MIN,
  VALIDATOR_MINLENGTH,
  VALIDATOR_REQUIRE,
} from "@/utils/validators";
import ImageUpload from "@/components/FormElements/ImageUpload/ImageUpload";
import Button from "@/components/FormElements/Button/Button";
import { ErrorModal } from "@/components/UI/ErrorModal/ErrorModal";

const NewPet = () => {
  const history = useHistory();
  const authContext = useContext<AuthContextType>(AuthContext);
  const { isLoading, error, sendRequest, clearError } = useHttp();

  const [formState, inputHandler] = useForm(
    {
      name: {
        value: "",
        isValid: false,
      },
      species: {
        value: "",
        isValid: false,
      },
      age: {
        value: null,
        isValid: false,
      },
      description: {
        value: "",
        isValid: false,
      },
      photo: {
        value: null,
        isValid: false,
      },
    },
    false
  );

  async function petSubmitHandler(event: React.FormEvent) {
    event.preventDefault();

    const name = formState.inputs.name?.value;
    const species = formState.inputs.species?.value;
    const age = formState.inputs.age?.value;
    const description = formState.inputs.description?.value;
    const photo = formState.inputs.photo?.value;

    if (
      !formState.isValid ||
      !name ||
      !species ||
      age == null ||
      !description ||
      !photo
    ) {
      console.error("Form data is incomplete or invalid. Aborting submission.");
      return;
    }

    try {
      const formData = new FormData();

      formData.append("species", species as string);
      formData.append("age", age.toString());
      formData.append("description", description as string);

      formData.append("photo", photo as File);

      await sendRequest(
        `${import.meta.env.VITE_BACKEND_URL}/pets`,
        "POST",
        formData,
        {
          Authorization: `Bearer ${authContext.token}`,
        }
      );

      history.push("/");
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <>
      <ErrorModal open={!!error} error={error} onClose={clearError} />
      <form className={classes["pet-form"]} onSubmit={petSubmitHandler}>
        {isLoading && <LoadingSpinner asOverlay />}

        <Input
          id="name"
          element="input"
          type="text"
          label="Pet Name"
          validators={[VALIDATOR_REQUIRE()]}
          errorText="Please enter a valid name for the pet!"
          onInput={inputHandler}
        />

        <Input
          id="species"
          element="input"
          type="text"
          label="Species (e.g., Dog, Cat, Bird)"
          validators={[VALIDATOR_REQUIRE()]}
          errorText="Please enter the pet's species!"
          onInput={inputHandler}
        />

        <Input
          id="age"
          element="input"
          type="number"
          label="Age (Years)"
          validators={[VALIDATOR_MIN(0)]}
          errorText="Age must be 0 or greater."
          onInput={inputHandler}
        />

        <Input
          id="description"
          element="input"
          label="Description"
          validators={[VALIDATOR_MINLENGTH(10)]}
          errorText="Please describe the pet in at least 10 characters."
          onInput={inputHandler}
        />

        <ImageUpload
          id="photo"
          onInput={inputHandler}
          errorText="Please provide a photo of the pet!"
        />

        <Button type="submit" disabled={!formState.isValid}>
          List Pet for Adoption
        </Button>
      </form>
    </>
  );
};

export default NewPet;
