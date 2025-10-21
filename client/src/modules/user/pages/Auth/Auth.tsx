import { FC, useContext, useEffect, useState } from "react";
import { yupResolver } from "@hookform/resolvers/yup";
import { SubmitHandler, useForm } from "react-hook-form";
import * as yup from "yup";

import { AuthContext, AuthContextType } from "@/contexts/auth-context";
import useHttp from "@/hooks/http-hook";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Snackbar,
  TextField,
  Typography,
} from "@mui/material";

const schema = yup.object({
  name: yup.string().when("$isLoginMode", {
    is: false,
    then: (s) =>
      s
        .required("Name is required")
        .min(2, "Name must be at least 2 characters"),
    otherwise: (s) => s.optional(),
  }),

  email: yup
    .string()
    .email("Invalid email address")
    .required("Email is required"),

  password: yup
    .string()
    .min(6, "Password must be at least 6 characters")
    .required("Password is required"),

  confirmPassword: yup.string().when("$isLoginMode", {
    is: false,
    then: (s) =>
      s
        .required("Please confirm password")
        .oneOf([yup.ref("password")], "Passwords must match"),
    otherwise: (s) => s.optional(),
  }),

  image: yup
    .mixed<FileList>()
    .nullable()
    .notRequired()
    .test("fileSize", "File too large (max 5MB)", (value) => {
      if (!value || value.length === 0) return true;
      return value[0].size <= 5_000_000;
    })
    .test("fileType", "Only JPG, JPEG, PNG allowed", (value) => {
      if (!value || value.length === 0) return true;
      const allowedTypes = ["image/jpeg", "image/jpg", "image/png"];
      return allowedTypes.includes(value[0].type);
    }),
});

type AuthFormInputs = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  image?: FileList;
};

const Auth: FC = () => {
  const authContext = useContext<AuthContextType>(AuthContext);
  const { isLoading, error, sendRequest, clearError } = useHttp();
  const [isLoginMode, setIsLoginMode] = useState<boolean>(true);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  useEffect(() => {
    if (error) {
      setToastMessage(error);
      setToastOpen(true);
    }
  }, [error]);

  const defaultAvatar = "/images/user/default-avatar-placeholder.jpg";

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<AuthFormInputs>({
    resolver: yupResolver(schema) as any, // TODO - Type
    context: { isLoginMode },
    mode: "onChange",
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const imageFiles = watch("image");
  const imagePreview =
    imageFiles && imageFiles.length > 0
      ? URL.createObjectURL(imageFiles[0])
      : defaultAvatar;

  const switchAuthModeHandler = () => {
    setIsLoginMode((prev) => !prev);
    clearError();
    reset();
  };

  const onSubmit: SubmitHandler<AuthFormInputs> = async (data) => {
    clearError();

    try {
      if (isLoginMode) {
        console.log("------- CALLING SEND REQUEST AUTH!");
        const responseData = await sendRequest(
          `${import.meta.env.VITE_BACKEND_URL}/users/login`,
          "POST",
          JSON.stringify({
            email: data.email,
            password: data.password,
          }),
          { "Content-Type": "application/json" }
        );

        const userId = responseData.userId ?? responseData._id;
        const token = responseData.token;

        if (!userId || !token) {
          throw new Error("Invalid server response");
        }

        authContext.login(userId, token);
      } else {
        const formData = new FormData();
        formData.append("name", data.name || "");
        formData.append("email", data.email);
        formData.append("password", data.password);

        if (data.image && data.image.length > 0) {
          formData.append("image", data.image[0]);
        }

        console.log("------- CALLING SEND REQUEST AUTH 2!");
        const responseData = await sendRequest(
          `${import.meta.env.VITE_BACKEND_URL}/users/signup`,
          "POST",
          formData
        );

        const userId = responseData.userId ?? responseData._id;
        const token = responseData.token;

        if (!userId || !token) {
          throw new Error("Invalid server response");
        }

        authContext.login(userId, token);
      }
    } catch (err) {
      console.error("Auth error:", err);
    }
  };

  return (
    <Card
      sx={{
        maxWidth: 450,
        margin: "3rem auto",
        padding: 3,
        boxShadow: 3,
        borderRadius: 3,
      }}
    >
      <CardContent>
        <Typography
          variant="h4"
          textAlign="center"
          gutterBottom
          fontWeight="bold"
        >
          {isLoginMode ? "Welcome Back" : "Create Account"}
        </Typography>

        <Typography
          variant="body2"
          textAlign="center"
          color="text.secondary"
          sx={{ mb: 3 }}
        >
          {isLoginMode
            ? "Login to find your perfect pet companion"
            : "Join us to adopt or list pets for adoption"}
        </Typography>

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

        <Box
          component="form"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
          {!isLoginMode && (
            <TextField
              label="Full Name"
              {...register("name")}
              error={!!errors.name}
              helperText={errors.name?.message}
              fullWidth
            />
          )}

          <TextField
            label="Email Address"
            type="email"
            {...register("email")}
            error={!!errors.email}
            helperText={errors.email?.message}
            fullWidth
          />

          <TextField
            label="Password"
            type="password"
            {...register("password")}
            error={!!errors.password}
            helperText={errors.password?.message}
            fullWidth
          />

          {!isLoginMode && (
            <TextField
              label="Confirm Password"
              type="password"
              {...register("confirmPassword")}
              error={!!errors.confirmPassword}
              helperText={errors.confirmPassword?.message}
              fullWidth
            />
          )}

          {!isLoginMode && (
            <Box sx={{ textAlign: "center", mt: 1 }}>
              <Avatar
                src={imagePreview}
                alt="Profile preview"
                sx={{
                  width: 100,
                  height: 100,
                  margin: "0 auto 1rem",
                  border: "3px solid",
                  borderColor: "primary.main",
                }}
              />
              <Button variant="outlined" component="label" size="small">
                Upload Avatar (Optional)
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png"
                  hidden
                  {...register("image")}
                />
              </Button>
              {errors.image && (
                <Typography
                  variant="caption"
                  color="error"
                  display="block"
                  mt={1}
                >
                  {errors.image.message}
                </Typography>
              )}
            </Box>
          )}

          {/* Submit button */}
          <Button
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
            size="large"
            disabled={isLoading}
            sx={{ mt: 2, py: 1.5 }}
          >
            {isLoading ? (
              <CircularProgress size={24} color="inherit" />
            ) : isLoginMode ? (
              "Login"
            ) : (
              "Create Account"
            )}
          </Button>
        </Box>

        <Box sx={{ mt: 3, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            {isLoginMode
              ? "Don't have an account?"
              : "Already have an account?"}
          </Typography>
          <Button
            variant="text"
            onClick={switchAuthModeHandler}
            sx={{ mt: 0.5 }}
          >
            {isLoginMode ? "Sign up here" : "Login here"}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
};

export default Auth;
