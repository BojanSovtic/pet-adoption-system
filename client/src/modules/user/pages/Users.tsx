import ErrorModal from "@/components/UI/ErrorModal/ErrorModal";
import LoadingSpinner from "@/components/UI/LoadingSpinner/LoadingSpinner";
import useHttp from "@/hooks/http-hook";
import { useEffect, useState } from "react";
import UsersList from "../components/UserList/UserList";
import Card from "@/components/UI/Card/Card";

function Users() {
  const { isLoading, error, sendRequest, clearError } = useHttp();
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    async function fetchUsers() {
      const data = await sendRequest(
        `${import.meta.env.VITE_BACKEND_URL}/users`
      );

      setUsers(data ? data.users : []);
    }

    fetchUsers();
  }, [sendRequest]);

  return (
    <div className="center">
      <ErrorModal error={error} onClear={clearError} />
      {isLoading && (
        <div className="center">
          <LoadingSpinner />
        </div>
      )}

      {!isLoading && users && users.length > 0 && <UsersList items={users} />}

      {!isLoading && users && users.length === 0 && (
        <Card className="center">
          <h3>No users found to adopt pets!</h3>
        </Card>
      )}
    </div>
  );
}

export default Users;
