import api from "@/api/axios";
import { UserDTO } from "../models/User";

export const userAPI = {
  getProfile: async (): Promise<UserDTO> => {
    const res = await api.get<{ user: UserDTO }>("/users/me");
    return res.data.user;
  },
  getUsers: async (): Promise<UserDTO[]> => {
    const res = await api.get<{ users: UserDTO[] }>("/users");
    return res.data.users;
  },
};
