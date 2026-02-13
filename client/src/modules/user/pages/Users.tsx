import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { Box, Card, CardContent, Typography } from "@mui/material";

import { UserDTO, UserView } from "../models/User";
import { dtoToUserView } from "../mappers/userMapper";
import { userAPI } from "../services/users-service";
import UsersList from "../components/UserList/UserList";

function Users() {
  const [users, setUsers] = useState<UserView[]>([]);
  const isLoading = useSelector(
    (state: RootState) => state.loading.counter > 0
  );

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const users = await userAPI.getUsers();
        if (!users) return;

        const mappedUsers: UserView[] = users.map((user: UserDTO) =>
          dtoToUserView(user)
        );

        setUsers(mappedUsers);
      } catch (err) {
        console.error("Failed to fetch users:", err);
      }
    };

    fetchUsers();
  }, []);

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        mt: 4,
        px: 2,
      }}
    >
      {!isLoading && users.length > 0 && <UsersList items={users} />}

      {!isLoading && users.length === 0 && (
        <Card sx={{ maxWidth: 400, p: 3, textAlign: "center" }}>
          <CardContent>
            <Typography variant="h6">No users found to adopt pets!</Typography>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

export default Users;
