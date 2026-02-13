import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface UIState {
  isOpen: boolean;
  message: string;
  severity: "error" | "success" | "info" | "warning";
}

const initialState: UIState = {
  isOpen: false,
  message: "",
  severity: "info",
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    showSnackbar(
      state,
      action: PayloadAction<{ message: string; severity?: UIState["severity"] }>
    ) {
      state.isOpen = true;
      state.message = action.payload.message;
      state.severity = action.payload.severity || "info";
    },
    hideSnackbar(state) {
      state.isOpen = false;
      state.message = "";
    },
  },
});

export const { showSnackbar, hideSnackbar } = uiSlice.actions;
export default uiSlice.reducer;
