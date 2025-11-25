import { useState, useEffect, FC } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import {
  Box,
  Button,
  capitalize,
  Card,
  CardContent,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import { useSelector } from "react-redux";
import * as yup from "yup";

import { RootState, store } from "@/store";
import { petAPI } from "@/modules/pets/services/pets-service";
import { PetSpecies } from "../models/PetSpecies";
import { PetView } from "../models/Pets";

interface PetFormInputs {
  name: string;
  species: string;
  age: number;
  description: string;
  images?: FileList;
}

interface PetFormProps {
  mode: "create" | "update";
}

const schema = yup.object({
  name: yup
    .string()
    .required("Name is required")
    .min(2, "Name must be at least 2 characters"),
  species: yup
    .string()
    .oneOf(PetSpecies, "Invalid species")
    .required("Species is required"),
  age: yup
    .number()
    .min(0, "Age must be 0 or greater")
    .required("Age is required"),
  description: yup
    .string()
    .min(2, "Description must be at least 2 characters long")
    .required("Description is required"),
  images: yup
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

const PetForm: FC<PetFormProps> = ({ mode }) => {
  const { petId } = useParams<{ petId: string }>();
  const navigate = useNavigate();
  const userId = store.getState().auth.userId;

  const [pet, setPet] = useState<PetView | null>(null);

  const isLoading = useSelector(
    (state: RootState) => state.loading.counter > 0
  );

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid },
  } = useForm<PetFormInputs>({
    resolver: yupResolver(schema) as any, // TODO - Type
    mode: "onChange",
  });

  useEffect(() => {
    if (mode === "update" && petId) {
      const fetchPet = async () => {
        try {
          const data = await petAPI.getPetById(petId);
          setPet(data.pet);
          reset({
            name: data.pet.name,
            species: data.pet.species,
            age: data.pet.age,
            description: data.pet.description,
          });
        } catch (err) {
          console.error("Failed to fetch pet:", err);
        }
      };
      fetchPet();
    }
  }, [mode, petId, reset]);

  const onSubmit: SubmitHandler<PetFormInputs> = async (data) => {
    const formData = new FormData();
    formData.append("name", data.name);
    formData.append("species", data.species);
    formData.append("age", data.age.toString());
    formData.append("description", data.description);
    if (data.images && data.images.length > 0) {
      formData.append("images", data.images[0]);
    }

    try {
      if (mode === "create") {
        petAPI.createPet(formData);
      } else if (mode === "update" && petId) {
        petAPI.updatePet(petId, formData);
      }
      navigate(`/${userId}/pets`);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <>
      <Card sx={{ maxWidth: 600, margin: "2rem auto", p: 3 }}>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} encType="multipart/form-data">
            <TextField
              label="Pet Name"
              {...register("name")}
              error={!!errors.name}
              helperText={errors.name?.message}
              fullWidth
              margin="normal"
            />

            <FormControl fullWidth error={!!errors.species}>
              <InputLabel id="species-label">Species</InputLabel>
              <Controller
                name="species"
                control={control}
                defaultValue={pet?.species || ""}
                render={({ field }) => (
                  <Select
                    {...field}
                    labelId="species-label"
                    id="species"
                    label="Species"
                  >
                    {PetSpecies.map((species) => (
                      <MenuItem key={species} value={species}>
                        {capitalize(species)}
                      </MenuItem>
                    ))}
                  </Select>
                )}
              />
              {errors.species && (
                <FormHelperText>{errors.species.message}</FormHelperText>
              )}
            </FormControl>

            <TextField
              label="Age"
              type="number"
              {...register("age")}
              error={!!errors.age}
              helperText={errors.age?.message}
              fullWidth
              margin="normal"
            />

            <TextField
              label="Description"
              {...register("description")}
              error={!!errors.description}
              helperText={errors.description?.message}
              fullWidth
              margin="normal"
              multiline
              rows={4}
            />

            <Controller
              name="images"
              control={control}
              render={({ field }) => (
                <Box>
                  <Button variant="outlined" component="label">
                    Upload Photos
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      multiple
                      hidden
                      onChange={(e) => field.onChange(e.target.files)}
                    />
                  </Button>
                  {field.value &&
                    Array.isArray(field.value) &&
                    field.value.length > 0 && (
                      <Typography variant="body2" mt={1}>
                        {Array.from(field.value)
                          .map((file: File) => file.name)
                          .join(", ")}
                      </Typography>
                    )}
                  {errors.images && (
                    <FormHelperText error>
                      {errors.images.message}
                    </FormHelperText>
                  )}
                </Box>
              )}
            />

            <Button
              type="submit"
              variant="contained"
              color="primary"
              fullWidth
              sx={{ mt: 3 }}
              disabled={!isValid || isLoading}
            >
              {mode === "create" ? "Create Pet" : "Update Pet"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
};

export default PetForm;
