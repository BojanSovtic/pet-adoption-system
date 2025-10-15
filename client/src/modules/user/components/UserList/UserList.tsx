import{ FC } from "react";

import classes from "./UsersList.module.css";

import { User } from "../../models/User";
import UserItem from "../UserItem/UserItem"; 

interface UsersListProps {
  items: User[];
}

const UsersList: FC<UsersListProps> = (props) => {
  if (props.items.length === 0) {
    return (
      <div className="center">
        <h2>No users found.</h2>
      </div>
    );
  }

  return (
    <ul className={classes["users-list"]}>
      {props.items.map((user) => (
        <UserItem
          key={user.id}
          id={user.id}
          name={user.name}
          image={user.image}
          petCount={user.pets.length} 
        />
      ))}
    </ul>
  );
};

export default UsersList;