import { FC } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  Typography,
  Avatar,
  Box,
  Badge,
} from "@mui/material";

interface UserItemProps {
  id: string;
  image?: string | null;
  name: string;
  petCount: number;
}

const UserItem: FC<UserItemProps> = ({ id, image, name, petCount }) => {
  const avatarUrl = image
    ? `${import.meta.env.VITE_ASSET_URL}${image}`
    : "/images/user/default-avatar-placeholder.jpg";

  return (
    <Box component="li" sx={{ listStyle: "none", mb: 2 }}>
      <Card
        variant="outlined"
        sx={{ display: "flex", alignItems: "center", p: 1 }}
      >
        <Link
          to={`/${id}/pets`}
          style={{
            display: "flex",
            alignItems: "center",
            textDecoration: "none",
            width: "100%",
          }}
        >
          <Badge badgeContent={petCount} color="primary" sx={{ mr: 2 }}>
            <Avatar src={avatarUrl} alt={name} sx={{ width: 64, height: 64 }} />
          </Badge>
          <CardContent sx={{ flex: 1, py: 0 }}>
            <Typography variant="h6" color="text.primary">
              {name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {petCount} {petCount === 1 ? "pet" : "pets"}
            </Typography>
          </CardContent>
        </Link>
      </Card>
    </Box>
  );
};

export default UserItem;
