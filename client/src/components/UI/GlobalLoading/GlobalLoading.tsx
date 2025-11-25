import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { Backdrop, CircularProgress } from "@mui/material";

const GlobalLoading = () => {
  const counter = useSelector((state: RootState) => state.loading.counter);

  return (
    <Backdrop open={counter > 0} sx={{ zIndex: 1300, color: "#fff" }}>
      <CircularProgress color="inherit" />
    </Backdrop>
  );
};

export default GlobalLoading;
