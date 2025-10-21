import { FC, useContext, useState, MouseEvent } from "react";

import classes from "./PetItem.module.css";
import useHttp from "@/hooks/http-hook";
import { AuthContext, AuthContextType } from "@/contexts/auth-context";
import Modal from "@/components/UI/Modal/Modal";
import Button from "@/components/FormElements/Button/Button";
import Card from "@/components/UI/Card/Card";
import LoadingSpinner from "@/components/UI/LoadingSpinner/LoadingSpinner";
import { PetView } from "../../models/Pets";
import { ErrorModal } from "@/components/UI/ErrorModal/ErrorModal";

interface PetItemProps extends PetView {
  onDelete: (deletedPetId: string) => void;
}

const PetItem: FC<PetItemProps> = (props) => {
  const { isLoading, error, sendRequest, clearError } = useHttp();

  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const authContext = useContext<AuthContextType>(AuthContext);

  function toggleShowDeleteModalHandler() {
    setShowDeleteModal((prevState) => !prevState);
  }

  async function deleteHandler(event: MouseEvent) {
    event.preventDefault();
    setShowDeleteModal(false);

    try {
      await sendRequest(
        `${import.meta.env.VITE_BACKEND_URL}/pets/${props.id}`,
        "DELETE",
        null,
        {
          Authorization: `Bearer ${authContext.token}`,
        }
      );

      props.onDelete(props.id);
      ``;
    } catch (err) {
      console.error(err);
    }
  }

  const imageSource = props.photos[0]
    ? `${import.meta.env.VITE_ASSET_URL}/${props.photos[0]}`
    : "https://placehold.co/600x400/CCCCCC/333333?text=No+Photo";

  const statusClass =
    props.status === "adopted"
      ? classes["status-adopted"]
      : classes["status-available"];

  return (
    <>
      <ErrorModal open={!!error} error={error} onClose={clearError} />

      <Modal
        show={showDeleteModal}
        onCancel={toggleShowDeleteModalHandler}
        header="Confirm Deletion"
        footerClass="pet-item__modal-actions"
        footer={
          <>
            <Button onClick={toggleShowDeleteModalHandler} inverse>
              Cancel
            </Button>
            <Button onClick={deleteHandler} danger>
              Delete
            </Button>
          </>
        }
      >
        <p style={{ margin: "1rem" }}>
          Are you sure you want to delete the listing for **{props.name}**? This
          action cannot be undone!
        </p>
      </Modal>

      <li className={classes["pet-item"]}>
        <Card className={classes["pet-item__content"]}>
          {isLoading && <LoadingSpinner asOverlay />}
          <div className={classes["pet-item__image"]}>
            <img src={imageSource} alt={props.name} />
          </div>
          <div className={classes["pet-item__info"]}>
            <h2 className={classes["pet-item__name"]}>{props.name}</h2>

            <div className={classes["pet-item__details"]}>
              <p>
                <strong>Species:</strong> {props.species || "N/A"}
              </p>
              <p>
                <strong>Breed:</strong> {props.breed || "Unknown"}
              </p>
              <p>
                <strong>Age:</strong>{" "}
                {props.age !== undefined ? `${props.age} years` : "N/A"}
              </p>
              <p className={statusClass}>
                <strong>Status:</strong>{" "}
                {props.status.charAt(0).toUpperCase() + props.status.slice(1)}
              </p>
            </div>

            <p className={classes["pet-item__description"]}>
              {props.description || "No detailed description provided."}
            </p>
          </div>
          <div className={classes["pet-item__actions"]}>
            {authContext.userId === props.owner && (
              <>
                <Button to={`/pets/${props.id}`}>Edit</Button>
                <Button onClick={toggleShowDeleteModalHandler} danger>
                  Delete
                </Button>
              </>
            )}

            {props.status === "available" &&
              authContext.userId !== props.owner && (
                <Button to={`/adopt/${props.id}`}>Adopt Me!</Button>
              )}
          </div>
        </Card>
      </li>
    </>
  );
};

export default PetItem;
