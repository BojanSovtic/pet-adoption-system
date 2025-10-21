import { FC } from "react";
import { Grid, Typography, Box } from "@mui/material";

import UserItem from "../UserItem/UserItem";
import { UserView } from "../../models/User";

interface UsersListProps {
  items: UserView[];
}

const UsersList: FC<UsersListProps> = ({ items }) => {
  if (items.length === 0) {
    return (
      <Box textAlign="center" mt={4}>
        <Typography variant="h6">No users found.</Typography>
      </Box>
    );
  }

  return (
    <Grid container spacing={2} sx={{ p: 2, width: "100%" }}>
      {items.map((user) => (
        <Grid size={{ xs: 12, sm: 6, md: 4 }} key={user.id}>
          <UserItem
            id={user.id}
            name={user.name}
            image={user.avatar ?? ""}
            petCount={user.petCount ?? 0}
          />
        </Grid>
      ))}
    </Grid>
  );
};

export default UsersList;
