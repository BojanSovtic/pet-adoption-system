import api from "@/api/axios";
import { PetDTO } from "../models/Pets";

export const petAPI = {
  deletePet: async (petId: string) => {
    const res = await api.delete(`/pets/${petId}`);
    return res.data;
  },

  getPets: async () => {
    const res = await api.get("/pets");
    return res.data;
  },

  getPetById: async (petId: string) => {
    const res = await api.get(`/pets/${petId}`);
    return res.data;
  },

  createPet: async (data: FormData) => {
    const res = await api.post("/pets", data, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return res.data;
  },

  updatePet: async (petId: string, data: FormData) => {
    const res = await api.put(`/pets/${petId}`, data, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return res.data;
  },

  getPetsByUserId: async (userId: string): Promise<PetDTO[]> => {
    const res = await api.get<{ pets: PetDTO[] }>(`/pets/user/${userId}`);
    return res.data.pets;
  },
};
