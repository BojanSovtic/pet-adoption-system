import  { FC, useContext, useState, FormEvent } from "react";

import classes from "./Auth.module.css";
import useForm, { InputsDictionary } from "@/hooks/form-hook";
import { AuthContext, AuthContextType } from "@/contexts/auth-context";
import useHttp from "@/hooks/http-hook";
import ErrorModal from "@/components/UI/ErrorModal/ErrorModal";
import Card from "@/components/UI/Card/Card";
import LoadingSpinner from "@/components/UI/LoadingSpinner/LoadingSpinner";
import Input from "@/components/FormElements/Input/Input";
import { Validator, VALIDATOR_EMAIL, VALIDATOR_MINLENGTH, VALIDATOR_REQUIRE } from "@/utils/validators";
import ImageUpload from "@/components/FormElements/ImageUpload/ImageUpload";
import Button from "@/components/FormElements/Button/Button";

const Auth: FC = () => {
  const authContext = useContext<AuthContextType>(AuthContext);
  
  const [isLoginMode, setIsLoginMode] = useState<boolean>(true);
  
  const { isLoading, error, sendRequest, clearError } = useHttp();

  const initialFormState: InputsDictionary = {
    email: { value: "", isValid: false },
    password: { value: "", isValid: false },
  };

  const [formState, inputHandler, setFormData] = useForm(
    initialFormState,
    false
  );

  async function submitHandler(event: FormEvent) {
    event.preventDefault();

    if (error) {
      clearError();
    }
    
    if (!formState.isValid && !isLoginMode) {
        console.log("Form is invalid! Check input handlers."); 
        return;
    }

    if (isLoginMode) {
      try {
        const responseData = await sendRequest(
          `${import.meta.env.VITE_BACKEND_URL}/users/login`,
          "POST",
          JSON.stringify({
            email: formState.inputs.email!.value,
            password: formState.inputs.password!.value,
          }),
          {
            "Content-Type": "application/json",
          }
        );

        authContext.login(responseData.userId, responseData.token);
      } catch (err) {
        console.error(err); 
      }
    } else {
      try {
        const nameValue = formState.inputs.name?.value as string;
        const imageValue = formState.inputs.image?.value as File;

        const formData = new FormData();
        formData.append("email", formState.inputs.email!.value as string);
        formData.append("name", nameValue);
        formData.append("password", formState.inputs.password!.value as string);
        formData.append("image", imageValue);

        const responseData = await sendRequest(
          `${import.meta.env.VITE_BACKEND_URL}/users/signup`,
          "POST",
          formData,
        );

        authContext.login(responseData.userId, responseData.token);
      } catch (err) {
        console.error(err); 
      }
    }
  }


  function switchAuthModeHandler() {
    if (!isLoginMode) {
      setFormData(
        {
          ...formState.inputs,
          name: undefined,
          image: undefined,
        },
        formState.inputs.email!.isValid && formState.inputs.password!.isValid
      );
    } else {
      setFormData(
        {
          ...formState.inputs,
          name: { value: "", isValid: false },
          image: { value: null!, isValid: false },
        },
        false
      );
    }

    setIsLoginMode((prevState) => !prevState);
  }

  return (
    <>
      <ErrorModal error={error} onClear={clearError} />
      <Card className={classes.authentication}>
        {isLoading && <LoadingSpinner asOverlay />}
        <h2>{isLoginMode ? "Login" : "Sign up"}</h2>
        <hr />
        <form onSubmit={submitHandler}>
          {!isLoginMode && (
            <Input
              id="name"
              element="input"
              type="text"
              label="Name"
              validators={[VALIDATOR_REQUIRE() as Validator]}
              errorText="Please enter your name!"
              onInput={inputHandler}
            />
          )}
          {!isLoginMode && (
            <ImageUpload
              id="image"
              center
              onInput={inputHandler}
              errorText="Please provide an image!"
            />
          )}
          <Input
            id="email"
            element="input"
            type="email"
            label="Email"
            validators={[VALIDATOR_EMAIL() as Validator]}
            errorText="Please enter a valid email address!"
            onInput={inputHandler}
          />
          <Input
            id="password"
            element="input"
            type="password"
            label="Password"
            validators={[VALIDATOR_MINLENGTH(6) as Validator]}
            errorText="Please enter a valid password (min. 6 characters)!"
            onInput={inputHandler}
          />
          <Button type="submit" disabled={!formState.isValid}>
            {isLoginMode ? "Login" : "Sign up"}
          </Button>
        </form>
        <p>
          {isLoginMode
            ? "Don't have an account? "
            : "Already have an account? "}

          <span onClick={switchAuthModeHandler} className={classes.link}>
            {isLoginMode ? "Sign up!" : "Login!"}
          </span>
        </p>
      </Card>
    </>
  );
};

export default Auth;