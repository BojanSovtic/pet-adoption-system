import { useReducer, useEffect, FC, ChangeEvent } from "react";

import { validate, Validator } from "@/utils/validators";

import classes from "./Input.module.css";



interface InputState {
  value: string;
  isValid: boolean;
  isTouched: boolean;
}

// Action types for the reducer
type ChangeAction = {
  type: 'CHANGE';
  value: string;
  validators: Validator[];
};

type TouchAction = {
  type: 'TOUCH';
};

type InputAction = ChangeAction | TouchAction;


function inputReducer(state: InputState, action: InputAction): InputState {
  switch (action.type) {
    case "CHANGE":
      return {
        ...state,
        value: action.value,
        isValid: validate(action.value, action.validators), 
      };
    case "TOUCH":
      return {
        ...state,
        isTouched: true,
      };
    default:
      return state;
  }
}

interface InputProps {
  id: string;
  label: string;
  placeholder?: string;
  errorText: string;
  element: 'input' | 'textarea';
  type?: string;
  rows?: number;
  initValue?: string;
  initValid?: boolean;
  onInput: (id: string, value: string, isValid: boolean) => void; 
  validators: Validator[];
}

const Input: FC<InputProps> = (props) => {
  const [inputState, dispatchInput] = useReducer(inputReducer, {
    value: props.initValue || "",
    isValid: props.initValid || false,
    isTouched: false,
  });

  const { id, onInput, validators } = props;
  const { value, isValid } = inputState;

  useEffect(() => {
    onInput(id, value, isValid); 
  }, [id, value, isValid, onInput]); 

  function changeHandler(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    dispatchInput({
      type: "CHANGE",
      value: event.target.value,
      validators: validators, 
    });
  }

  function touchHandler() {
    dispatchInput({ type: "TOUCH" });
  }

  const element =
    props.element === "input" ? (
      <input
        id={props.id}
        type={props.type}
        placeholder={props.placeholder}
        onChange={changeHandler}
        onBlur={touchHandler}
        value={inputState.value}
      />
    ) : (
      <textarea
        id={props.id}
        rows={props.rows || 3}
        onChange={changeHandler}
        onBlur={touchHandler}
        value={inputState.value}
      />
    );

  return (
    <div
      className={`${classes["form-control"]} ${
        !inputState.isValid &&
        inputState.isTouched &&
        classes["form-control--invalid"]
      }`}
    >
      <label htmlFor={props.id}>{props.label}</label>
      {element}
      {!inputState.isValid && inputState.isTouched && <p>{props.errorText}</p>}
    </div>
  );
}

export default Input;