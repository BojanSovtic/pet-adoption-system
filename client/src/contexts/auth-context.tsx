import { createContext } from "react";

export interface AuthContextType {
  isLoggedIn: boolean;
  token: string | null;
  userId: string | null;
  login: (uid: string, token: string, expirationDate?: Date) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType>({
  isLoggedIn: false,
  token: null,
  userId: null,
  login: (uid: string, token: string, expirationDate?: Date) => {},
  logout: () => {},
});