import { useCallback, useReducer } from "react";

type InputValue = string | File | null | undefined; 

export interface InputData {
  value: InputValue;
  isValid: boolean;
}

export interface InputsDictionary {
  [inputId: string]: InputData | undefined;
}

export interface FormState {
  inputs: InputsDictionary;
  isValid: boolean;
}

interface InputChangeAction {
  type: 'INPUT_CHANGE';
  inputId: string;
  value: InputValue;
  isValid: boolean;
}

interface SetDataAction {
  type: 'SET_DATA';
  inputs: InputsDictionary;
  formIsValid: boolean;
}

type FormAction = InputChangeAction | SetDataAction;

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "INPUT_CHANGE":
      let formIsValid = true;

      for (const inputId in state.inputs) {
        if (!state.inputs[inputId]) {
          continue;
        }

        if (inputId === action.inputId) {
          formIsValid = formIsValid && action.isValid;
        } else {
          formIsValid = formIsValid && state.inputs[inputId]!.isValid;
        }
      }

      return {
        ...state,
        inputs: {
          ...state.inputs,
          [action.inputId]: {
            value: action.value,
            isValid: action.isValid,
          },
        },
        isValid: formIsValid,
      };

    case "SET_DATA":
      return {
        inputs: action.inputs,
        isValid: action.formIsValid,
      };

    default:
      return state;
  }
}

type UseFormReturn = [
  FormState,
  (id: string, value: InputValue, isValid: boolean) => void, 
  (inputs: InputsDictionary, formIsValid: boolean) => void
];

export default function useForm(initialInputs: InputsDictionary, initialIsValid: boolean): UseFormReturn {
  const [formState, dispatchForm] = useReducer(formReducer, {
    inputs: initialInputs,
    isValid: initialIsValid,
  });

  const inputHandler = useCallback(
    (id: string, value: InputValue, isValid: boolean) => {
      dispatchForm({
        type: "INPUT_CHANGE",
        inputId: id,
        value,
        isValid,
      });
    },
    []
  );

  const setFormData = useCallback(
    (inputs: InputsDictionary, formIsValid: boolean) => {
      dispatchForm({
        type: "SET_DATA",
        inputs,
        formIsValid,
      });
    },
    []
  );

  return [formState, inputHandler, setFormData];
}