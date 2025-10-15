import { FC, ReactNode, MouseEvent } from "react";
import { CSSTransition } from "react-transition-group";
import ReactDOM from "react-dom";

import classes from "./SideDrawer.module.css";

interface SideDrawerProps {
  show: boolean;
  onClick: (event: MouseEvent<HTMLElement>) => void;
  children: ReactNode;
}

const SideDrawer: FC<SideDrawerProps> = (props) => {
  const drawerHook = document.getElementById("drawer-hook");

  if (!drawerHook) {
    console.error("The portal element 'drawer-hook' was not found in the DOM.");
    return null; 
  }

  const content = (
    <CSSTransition
      in={props.show}
      timeout={200}
      classNames="slide-in-left"
      mountOnEnter
      unmountOnExit
    >
      <aside 
        onClick={props.onClick} 
        className={classes["side-drawer"]}
      >
        {props.children}
      </aside>
    </CSSTransition>
  );

  return ReactDOM.createPortal(content, drawerHook);
};

export default SideDrawer;