import  { useState, FC } from "react";
import { Link } from "react-router-dom";

import classes from "./MainNavigation.module.css";
import Backdrop from "@/components/UI/Backdrop/Backdrop";
import SideDrawer from "@/components/Navigation/SideDrawer/SideDrawer";
import NavLinks from "@/components/Navigation/NavLinks/NavLinks";
import MainHeader from "@/components/Navigation/MainHeader/MainHeader";

interface MainNavigationProps {}

const MainNavigation: FC<MainNavigationProps> = () => {
  const [drawerIsOpen, setDrawerIsOpen] = useState<boolean>(false);

  const toggleDrawerHandler = () => {
    setDrawerIsOpen((prevIsOpen) => !prevIsOpen);
  };

  return (
    <>
      {drawerIsOpen && <Backdrop onClick={toggleDrawerHandler} />}
      <SideDrawer show={drawerIsOpen} onClick={toggleDrawerHandler}>
        <nav className={classes["main-navigation__drawer-nav"]}>
          <NavLinks />
        </nav>
      </SideDrawer>
      
      <MainHeader>
        <button
          className={classes["main-navigation__menu-btn"]}
          onClick={toggleDrawerHandler}
        >
          <span />
          <span />
          <span />
        </button>
        
        <h1 className={classes["main-navigation__title"]}>
          <Link to="/">Pet Adoption System</Link>
        </h1>
        
        <nav className={classes["main-navigation__header-nav"]}>
          <NavLinks />
        </nav>
      </MainHeader>
    </>
  );
};

export default MainNavigation;