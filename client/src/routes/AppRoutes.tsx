import React, { Suspense, FC } from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import LoadingSpinner from "@/components/UI/LoadingSpinner/LoadingSpinner";
import Users from "@/modules/user/pages/Users";

const UserPets = React.lazy(() => import("@/modules/pets/pages/UserPets"));
const PetForm = React.lazy(() => import("@/modules/pets/pages/PetForm"));
const Auth = React.lazy(() => import("@/modules/user/pages/Auth/Auth"));

interface AppRoutesProps {
  isLoggedIn: boolean;
}

const AppRoutes: FC<AppRoutesProps> = ({ isLoggedIn }) => {
  return (
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

        {isLoggedIn ? (
          <>
            <Route path="/pets/new" element={<PetForm mode="create" />} />
            <Route path="/pets/:petId" element={<PetForm mode="update" />} />
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
  );
};

export default AppRoutes;
