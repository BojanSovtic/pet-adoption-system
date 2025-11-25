import api from "@/api/axios";

export interface LoginDTO {
  email: string;
  password: string;
}

export interface SignupDTO {
  name: string;
  email: string;
  password: string;
  image?: File | null;
}

export const authAPI = {
  login: async (data: LoginDTO) => {
    const res = await api.post("/users/login", data);
    return res.data;
  },

  signup: async (data: SignupDTO) => {
    const formData = new FormData();
    formData.append("name", data.name);
    formData.append("email", data.email);
    formData.append("password", data.password);
    if (data.image) formData.append("image", data.image);

    const res = await api.post("/users/signup", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  getProfile: async () => {
    const res = await api.get("/users/me");
    return res.data;
  },
};
