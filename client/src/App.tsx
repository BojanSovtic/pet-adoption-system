import { FC, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

import AppRoutes from "./routes/AppRoutes";
import MainNavigation from "@/components/Navigation/MainNavigation/MainNavigation";
import GlobalSnackbar from "./components/UI/GlobalSnackbar/GlobalSnackbar";
import GlobalLoading from "./components/UI/GlobalLoading/GlobalLoading";
import { restore } from "./modules/user/slices/authSlice";
import { RootState } from "./store";

const App: FC = () => {
  const dispatch = useDispatch();
  const token = useSelector((state: RootState) => state.auth.token);

  useEffect(() => {
    const storedUserString = localStorage.getItem("user");
    if (!storedUserString) return;

    try {
      const storedUser = JSON.parse(storedUserString);
      const expirationDate = new Date(storedUser.expirationDate);

      if (storedUser.tokeny && expirationDate > new Date()) {
        dispatch(
          restore({
            userId: storedUser.userId,
            token: storedUser.token,
            expiratonDate: storedUser.expiratonDate,
          })
        );
      }
    } catch (error) {
      console.error("Failed to parse user data from storage:", error);
      localStorage.removeItem("user");
    }
  }, [dispatch]);

  return (
    <>
      <MainNavigation />
      <main>
        <AppRoutes isLoggedIn={!!token} />
      </main>

      <GlobalSnackbar />
      <GlobalLoading />
    </>
  );
};

export default App;
