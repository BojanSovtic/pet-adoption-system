import { FC, ReactNode } from "react";

import classes from "./MainHeader.module.css";

interface MainHeaderProps {
  children: ReactNode; 
}

const MainHeader: FC<MainHeaderProps> = (props) => {
  return <header className={classes["main-header"]}>{props.children}</header>;
};

export default MainHeader;