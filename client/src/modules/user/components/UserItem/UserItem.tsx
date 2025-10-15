import  { FC } from "react";
import { Link } from "react-router-dom";

import Avatar from "@/components/UI/Avatar/Avatar";
import Card from "@/components/UI/Card/Card";

// Assuming css.d.ts is set up
import classes from "./UserItem.module.css";


interface UserItemProps {
  id: string;
  image: string; 
  name: string;
  petCount: number; 
}

const UserItem: FC<UserItemProps> = (props) => {
  const petCount = props.petCount; 
  
  return (
    <li className={classes["user-item"]}>
      <Card className={classes["user-item__content"]}>
        <Link to={`/${props.id}/pets`}> 
          <div className={classes["user-item__image"]}>
            <Avatar
              image={`${import.meta.env.VITE_ASSET_URL}/${props.image}`}
              alt={props.name}
            />
          </div>
          <div className={classes["user-item__info"]}>
            <h2>{props.name}</h2>
            <h3>
              {petCount} {petCount === 1 ? "pet" : "pets"}
            </h3>
          </div>
        </Link>
      </Card>
    </li>
  );
};

export default UserItem;