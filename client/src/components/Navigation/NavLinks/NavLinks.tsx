import { FC } from "react";
import { NavLink } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";

import classes from "./NavLinks.module.css";
import Button from "@/components/FormElements/Button/Button";
import { RootState } from "@/store";
import { logout } from "@/modules/user/slices/authSlice";

interface NavLinksProps {}

const NavLinks: FC<NavLinksProps> = () => {
  const dispatch = useDispatch();

  const { userId, token } = useSelector((state: RootState) => state.auth);
  const isLoggedIn = !!token;

  return (
    <ul className={classes["nav-links"]}>
      <li>
        <NavLink to={"/"} end>
          All Pets
        </NavLink>
      </li>

      {isLoggedIn && (
        <li>
          <NavLink to={`/${userId}/pets`}>My Pets</NavLink>
        </li>
      )}

      {isLoggedIn && (
        <li>
          <NavLink to={"/pets/new"}>Add Pet</NavLink>
        </li>
      )}

      {!isLoggedIn && (
        <li>
          <NavLink to={"/auth"}>Login</NavLink>
        </li>
      )}

      {isLoggedIn && (
        <li>
          <Button onClick={() => dispatch(logout())}>Logout</Button>
        </li>
      )}
    </ul>
  );
};

export default NavLinks;
