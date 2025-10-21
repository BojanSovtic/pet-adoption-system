import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
} from "@mui/material";
interface ErrorModalProps {
  open: boolean;
  error: string | null;
  onClose: () => void;
}

export const ErrorModal: React.FC<ErrorModalProps> = ({
  open,
  error,
  onClose,
}) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle color="error.main">Error</DialogTitle>
      <DialogContent>
        <Typography>{error}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained" color="primary">
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
};
