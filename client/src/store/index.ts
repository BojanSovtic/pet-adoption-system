import { configureStore } from "@reduxjs/toolkit";
import uiReducer from "./ui/uiSlice";
import loadingReducer from "./ui/loadingSlice";
import authReducer from "@/modules/user/slices/authSlice";

export const store = configureStore({
  reducer: {
    ui: uiReducer,
    loading: loadingReducer,
    auth: authReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
