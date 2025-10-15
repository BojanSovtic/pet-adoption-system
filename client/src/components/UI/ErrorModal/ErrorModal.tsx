import  { FC, MouseEvent } from "react";

import Modal from "../Modal/Modal";
import Button from "@/components/FormElements/Button/Button"; 

import classes from "./ErrorModal.module.css";

interface ErrorModalProps {
  error: string | null | undefined;
  onClear: (event: MouseEvent<HTMLButtonElement | HTMLDivElement>) => void;
}

const ErrorModal: FC<ErrorModalProps> = (props) => {
  return (
    <Modal
      onCancel={props.onClear as (event: MouseEvent<HTMLDivElement>) => void}
      
      header="An Error Occurred!"
      
      show={!!props.error}
      
      footer={<Button onClick={props.onClear as (event: MouseEvent<HTMLButtonElement>) => void}>Okay</Button>}
    >
      <p className={classes.error}>
        {props.error}
      </p>
    </Modal>
  );
};

export default ErrorModal;