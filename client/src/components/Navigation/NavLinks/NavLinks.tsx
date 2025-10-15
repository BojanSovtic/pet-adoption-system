import { useContext, FC } from "react";
import { NavLink } from "react-router-dom";

import { AuthContext } from "@/contexts/auth-context";
import classes from "./NavLinks.module.css";
import Button from "@/components/FormElements/Button/Button";

interface NavLinksProps {}

const NavLinks: FC<NavLinksProps> = () => {
  const authContext = useContext(AuthContext);
  
  return (
    <ul className={classes["nav-links"]}>
      <li>
        <NavLink to={"/"} end> 
          All Pets
        </NavLink>
      </li>
      
      {authContext.isLoggedIn && (
        <li>
          <NavLink to={`/${authContext.userId}/pets`}>My Pets</NavLink>
        </li>
      )}
      
      {authContext.isLoggedIn && (
        <li>
          <NavLink to={"/pets/new"}>Add Pet</NavLink>
        </li>
      )}
      
      {!authContext.isLoggedIn && (
        <li>
          <NavLink to={"/auth"}>Login</NavLink>
        </li>
      )}
      
      {authContext.isLoggedIn && (
        <li>
          <Button onClick={authContext.logout}>Logout</Button>
        </li>
      )}
    </ul>
  );
};

export default NavLinks;