import { store } from "@/store";
import { logout } from "../slices/authSlice";

let logoutTimer: ReturnType<typeof setTimeout> | undefined;

export const setupAutoLogout = (expDate: string) => {
  const remainingTime = new Date(expDate).getTime() - new Date().getTime();

  if (logoutTimer) clearTimeout(logoutTimer);

  logoutTimer = setTimeout(() => {
    store.dispatch(logout());
  }, remainingTime);
};
