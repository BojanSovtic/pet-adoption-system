import { useEffect, useState } from "react";
import LoadingSpinner from "@/components/UI/LoadingSpinner/LoadingSpinner";
import Card from "@/components/UI/Card/Card";
import useHttp from "@/hooks/http-hook";
import { UserDTO, UserView } from "../models/User";
import UsersList from "../components/UserList/UserList";
import { Alert, Snackbar } from "@mui/material";
import { dtoToUserView } from "../mappers/userMapper";

function Users() {
  const { isLoading, error, sendRequest, clearError } = useHttp();
  const [users, setUsers] = useState<UserView[]>([]);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  useEffect(() => {
    if (error) {
      setToastMessage(error);
      setToastOpen(true);
    }
  }, [error]);

  useEffect(() => {
    async function fetchUsers() {
      try {
        const data = await sendRequest(
          `${import.meta.env.VITE_BACKEND_URL}/users`
        );
        if (!data || !data.users) return;

        const mappedUsers: UserView[] = data.users.map((user: UserDTO) =>
          dtoToUserView(user)
        );

        setUsers(mappedUsers);
      } catch (err) {
        console.error("Failed to fetch users:", err);
      }
    }

    fetchUsers();
  }, [sendRequest]);

  return (
    <div className="center">
      <Snackbar
        open={toastOpen}
        autoHideDuration={5000}
        onClose={() => {
          setToastOpen(false);
          clearError();
        }}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          onClose={() => {
            setToastOpen(false);
            clearError();
          }}
          severity="error"
          sx={{ width: "100%" }}
        >
          {toastMessage.split("\n").map((msg, idx) => (
            <div key={idx}>{msg}</div>
          ))}
        </Alert>
      </Snackbar>

      {isLoading && (
        <div className="center">
          <LoadingSpinner />
        </div>
      )}

      {!isLoading && users.length > 0 && <UsersList items={users} />}

      {!isLoading && users.length === 0 && (
        <Card className="center">
          <h3>No users found to adopt pets!</h3>
        </Card>
      )}
    </div>
  );
}

export default Users;
