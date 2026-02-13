import { store } from "@/store";
import { startLoading, stopLoading } from "@/store/ui/loadingSlice";
import { showSnackbar } from "@/store/ui/uiSlice";
import axios from "axios";

const baseURL = import.meta.env.DEV ? "/api" : import.meta.env.VITE_BACKEND_URL;

const api = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  (config) => {
    store.dispatch(startLoading());

    const token = store.getState().auth.token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    store.dispatch(stopLoading());
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => {
    store.dispatch(stopLoading());
    return response;
  },
  async (error) => {
    store.dispatch(stopLoading());

    // TODO - Add better generic message when implementing i18n
    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      "Unexpected error";

    store.dispatch(showSnackbar({ message, severity: "error" }));

    return Promise.reject(error);
  }
);

export default api;
