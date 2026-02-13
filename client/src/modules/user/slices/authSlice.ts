import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { setupAutoLogout } from "../utils/autoLogoutUtil";

interface AuthState {
  userId: string | null;
  token: string | null;
  expiratonDate: string | null; // ISO string
}

const initialState: AuthState = {
  userId: null,
  token: null,
  expiratonDate: null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    login: (
      state,
      action: PayloadAction<{
        userId: string;
        token: string;
        expirationDate?: string;
      }>
    ) => {
      state.userId = action.payload.userId;
      state.token = action.payload.token;
      state.expiratonDate =
        action.payload.expirationDate || getDefaultExpirationDate();

      localStorage.setItem(
        "user",
        JSON.stringify({
          userId: state.userId,
          token: state.token,
          expiration: state.expiratonDate,
        })
      );

      setupAutoLogout(state.expiratonDate);
    },
    logout: (state) => {
      state.userId = null;
      state.token = null;
      state.expiratonDate = null;
      localStorage.removeItem("user");
    },
    restore: (state, action: PayloadAction<AuthState>) => {
      state.userId = action.payload.userId;
      state.token = action.payload.token;
      state.expiratonDate =
        action.payload.expiratonDate || getDefaultExpirationDate();

      setupAutoLogout(state.expiratonDate);
    },
  },
});

const getDefaultExpirationDate = () => {
  return new Date(new Date().getTime() + 1000 * 60 * 60).toISOString(); // Default 1 hour
};

export const { login, logout, restore } = authSlice.actions;
export default authSlice.reducer;
