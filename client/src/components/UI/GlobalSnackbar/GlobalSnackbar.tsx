import { FC } from "react";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "@/store";
import { Snackbar, Alert } from "@mui/material";
import { hideSnackbar } from "@/store/ui/uiSlice";

const GlobalSnackbar: FC = () => {
  const dispatch = useDispatch();
  const { isOpen, message, severity } = useSelector(
    (state: RootState) => state.ui
  );

  const handleClose = () => {
    dispatch(hideSnackbar());
  };

  return (
    <Snackbar
      open={isOpen}
      autoHideDuration={4000}
      onClose={handleClose}
      anchorOrigin={{ vertical: "top", horizontal: "center" }}
    >
      <Alert onClose={handleClose} severity={severity} sx={{ width: "100%" }}>
        {message}
      </Alert>
    </Snackbar>
  );
};

export default GlobalSnackbar;
