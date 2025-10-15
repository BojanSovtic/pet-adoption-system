import  { FC, ReactNode, CSSProperties, FormEvent, MouseEvent } from "react";
import ReactDOM from "react-dom";
import { CSSTransition } from "react-transition-group";

import Backdrop from "../Backdrop/Backdrop";

import classes from "./Modal.module.css";

interface ModalOverlayBaseProps {
  children: ReactNode;
  header: ReactNode; 
  footer: ReactNode; 
  className?: string;
  style?: CSSProperties;
  headerClass?: string;
  contentClass?: string;
  footerClass?: string;
}

type ModalOverlayWithSubmit = ModalOverlayBaseProps & {
  onSubmit: (event: FormEvent) => void; 
};

type ModalOverlayWithoutSubmit = ModalOverlayBaseProps & {
  onSubmit?: undefined;
};

type ModalOverlayProps = ModalOverlayWithSubmit | ModalOverlayWithoutSubmit;

interface ModalProps extends ModalOverlayBaseProps  {
  show: boolean;
  onCancel: (event: MouseEvent<HTMLDivElement>) => void; 
}

const ModalOverlay: FC<ModalOverlayProps> = (props) => {
  const content = (
    <div className={`${classes.modal} ${props.className || ''}`} style={props.style}>
      <header className={`${classes["modal__header"]} ${props.headerClass || ''}`}>
        <h2>{props.header}</h2>
      </header>
      
      <form
        onSubmit={
          props.onSubmit 
            ? props.onSubmit 
            : (event) => event.preventDefault()
        }
      >
        <div className={`${classes["modal__content"]} ${props.contentClass || ''}`}>
          {props.children}
        </div>
        
        <footer className={`${classes["modal__footer"]} ${props.footer}`}>
          {props.footer}
        </footer>
      </form>
    </div>
  );

  const modalHook = document.getElementById("modal-hook");

  if (!modalHook) {
    console.error("The portal element 'modal-hook' was not found in the DOM.");
    return null;
  }

  return ReactDOM.createPortal(content, modalHook);
}

const Modal: FC<ModalProps> = (props) => {
  return (
    <>
      {props.show && <Backdrop onClick={props.onCancel} />}
      
      <CSSTransition
        in={props.show}
        mountOnEnter
        unmountOnExit
        timeout={200}
        classNames={{
          enterActive: classes["modal-enter"],
          enterDone: classes["modal-enter-active"],
          exitActive: classes["modal-exit-active"],
          exitDone: classes["modal-exit"],
        }}
      >
        {}
        <ModalOverlay {...props} /> 
      </CSSTransition>
    </>
  );
}

export default Modal;