import  { FC, MouseEvent } from "react";
import ReactDOM from "react-dom";

import classes from "./Backdrop.module.css";


interface BackdropProps {
  onClick: (event: MouseEvent<HTMLDivElement>) => void;
}

const Backdrop: FC<BackdropProps> = (props) => {
  const backdropHook = document.getElementById("backdrop-hook");

  if (!backdropHook) {
    console.error("The portal element 'backdrop-hook' was not found in the DOM.");
    return null; 
  }

  return ReactDOM.createPortal(
    <div 
      className={classes.backdrop} 
      onClick={props.onClick}
    ></div>,
    backdropHook
  );
};

export default Backdrop;