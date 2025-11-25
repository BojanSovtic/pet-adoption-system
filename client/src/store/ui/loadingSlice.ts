import { createSlice } from "@reduxjs/toolkit";

interface LoadingState {
  counter: number;
}

const initialState: LoadingState = {
  counter: 0,
};

const loadingSlice = createSlice({
  name: "loading",
  initialState,
  reducers: {
    startLoading(state) {
      state.counter += 1;
    },
    stopLoading(state) {
      state.counter = Math.max(0, state.counter - 1);
    },
    resetLoading(state) {
      state.counter = 0;
    },
  },
});

export const { startLoading, stopLoading, resetLoading } = loadingSlice.actions;
export default loadingSlice.reducer;
