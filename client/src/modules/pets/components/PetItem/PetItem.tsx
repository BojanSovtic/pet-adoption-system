import { FC, useState, MouseEvent } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Card,
  CardMedia,
  CardContent,
  CardActions,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Box,
  Chip,
} from "@mui/material";
import { petAPI } from "@/modules/pets/services/pets-service";
import { useSelector } from "react-redux";
import { RootState, store } from "@/store";

import { PetView } from "../../models/Pets";
interface PetItemProps extends PetView {
  onDelete: (deletedPetId: string) => void;
}

const PetItem: FC<PetItemProps> = (props) => {
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const userId = store.getState().auth.userId;

  const isLoading = useSelector(
    (state: RootState) => state.loading.counter > 0
  );

  const toggleShowDeleteModalHandler = () => {
    setShowDeleteModal((prevState) => !prevState);
  };

  const deleteHandler = async (event: MouseEvent) => {
    event.preventDefault();
    setShowDeleteModal(false);

    try {
      await petAPI.deletePet(props.id);

      props.onDelete(props.id);
    } catch (err) {
      console.error(err);
    }
  };

  const defaultPetImage = "/images/pets/pets-placeholder.png";
  const imageSource =
    props.images && props.images.length
      ? `${import.meta.env.VITE_ASSET_URL}/${props.images[0]}`
      : defaultPetImage;

  const statusLabel = props.status
    ? props.status.charAt(0).toUpperCase() + props.status.slice(1)
    : ""; // TODO - Add default status

  return (
    <Box component="li" sx={{ listStyle: "none", mb: 2 }}>
      <Card sx={{ display: "flex", position: "relative" }}>
        {isLoading && (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.6)",
              zIndex: 10,
            }}
          >
            <CircularProgress />
          </Box>
        )}

        <CardMedia
          component="img"
          image={imageSource}
          alt={props.name}
          sx={{ width: 260, objectFit: "cover" }}
        />

        <Box sx={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <CardContent sx={{ flex: "1 0 auto" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Typography component="h2" variant="h6">
                {props.name}
              </Typography>

              <Chip
                label={statusLabel}
                color={props.status === "adopted" ? "default" : "success"}
                size="small"
              />
            </Box>

            <Box sx={{ mt: 1 }}>
              <Typography variant="body2">
                <strong>Species:</strong> {props.species || "N/A"}
              </Typography>
              <Typography variant="body2">
                <strong>Breed:</strong> {props.breed || "Unknown"}
              </Typography>
              <Typography variant="body2">
                <strong>Age:</strong>{" "}
                {props.age !== undefined ? `${props.age} years` : "N/A"}
              </Typography>
            </Box>

            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {props.description || "No detailed description provided."}
              </Typography>
            </Box>
          </CardContent>

          <CardActions sx={{ px: 2, pb: 2 }}>
            {userId === props.owner && (
              <>
                <Button
                  component={RouterLink}
                  to={`/pets/${props.id}`}
                  variant="contained"
                  size="small"
                >
                  Edit
                </Button>

                <Button
                  onClick={toggleShowDeleteModalHandler}
                  variant="outlined"
                  color="error"
                  size="small"
                >
                  Delete
                </Button>
              </>
            )}

            {props.status === "available" && userId !== props.owner && (
              <Button
                component={RouterLink}
                to={`/adopt/${props.id}`}
                variant="contained"
                size="small"
              >
                Adopt Me!
              </Button>
            )}
          </CardActions>
        </Box>
      </Card>

      <Dialog open={showDeleteModal} onClose={toggleShowDeleteModalHandler}>
        <DialogTitle>Confirm Deletion</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the listing for{" "}
            <strong>{props.name}</strong>? This action cannot be undone!
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={toggleShowDeleteModalHandler} size="small">
            Cancel
          </Button>
          <Button
            onClick={deleteHandler}
            size="small"
            color="error"
            variant="contained"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PetItem;
