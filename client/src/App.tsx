import React, { Suspense, FC } from "react";
import { Route, Routes, Navigate } from "react-router-dom";

import MainNavigation from "@/components/Navigation/MainNavigation/MainNavigation";
import Users from "./modules/user/pages/Users";
import useAuth from "./hooks/auth-hook";
import { AuthContext, AuthContextType } from "./contexts/auth-context";
import LoadingSpinner from "./components/UI/LoadingSpinner/LoadingSpinner";

const UserPets = React.lazy(() => import("./modules/pets/pages/UserPets")); 
const NewPet = React.lazy(() => import("./modules/pets/pages/NewPet")); 
const UpdatePet = React.lazy(() => import("./modules/pets/pages/UpdatePet"));
const Auth = React.lazy(() => import("./modules/user/pages/Auth/Auth")); 

const App: FC = () => {
  const { userId, token, login, logout } = useAuth();

  const contextValue: AuthContextType = {
    isLoggedIn: !!token,
    token: token,
    userId: userId,
    login: login,
    logout: logout,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      <MainNavigation />
      <main>
        <Suspense
          fallback={
            <div className="center">
              <LoadingSpinner asOverlay />
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<Users />} />
            <Route path="/:userId/pets" element={<UserPets />} />
            
            {token ? (
              <>
                <Route path="/pets/new" element={<NewPet />} />
                <Route path="/pets/:petId" element={<UpdatePet />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </>
            ) : (
              <>
                <Route path="/auth" element={<Auth />} />
                <Route path="*" element={<Navigate to="/auth" replace />} />
              </>
            )}
          </Routes>
        </Suspense>
      </main>
    </AuthContext.Provider>
  );
};

export default App;