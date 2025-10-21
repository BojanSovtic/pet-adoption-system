import { UserDTO, UserView } from "../models/User";

export const dtoToUserView = (userDTO: UserDTO): UserView => {
  return {
    id: userDTO.id,
    name: userDTO.name,
    email: userDTO.email,
    avatar: userDTO.avatar ?? null,
    role: userDTO.role,
    petCount: userDTO.petCount ?? 0,
  };
};
