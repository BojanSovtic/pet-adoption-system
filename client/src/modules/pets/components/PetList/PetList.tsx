import{ FC } from "react";

import classes from "./PetList.module.css"; 
import { Pet } from "../../models/Pets";
import Card from "@/components/UI/Card/Card";
import Button from "@/components/FormElements/Button/Button";
import PetItem from "../PetItem/PetItem";

interface PetListProps {
  items: Pet[];
  onDelete: (deletedPetId: string) => void;
}

const PetList: FC<PetListProps> = (props) => {
  if (props.items.length === 0) {
    return (
      <Card className={`${classes["pet-list"]} center`}>
        <h2>No pets found. Maybe create a new listing?</h2>
        <Button to="/pets/new">Add pet listing</Button>
      </Card>
    );
  }

  return (
    <ul className={classes["pet-list"]}>
      {props.items.map((pet) => (
        <PetItem
          key={pet.id}
          {...pet} 
          onDelete={props.onDelete}
        />
      ))}
    </ul>
  );
};

export default PetList;
