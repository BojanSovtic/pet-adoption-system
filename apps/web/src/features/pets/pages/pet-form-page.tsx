import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  PET_DESCRIPTION_MAX_LENGTH,
  PET_NAME_MAX_LENGTH,
  PET_SPECIES,
  type CreatePetInput,
} from '@pet-adoption/models';

import { Button } from '@/components/ui/button';

import {
  getErrorMessage,
  getFieldErrors,
} from '../../../lib/get-error-message';
import { useCurrentUser } from '../../auth/hooks/use-current-user';
import { createPet } from '../api/create-pet';
import { getPet } from '../api/get-pet';
import { deletePetImage, uploadPetImage } from '../api/pet-image';
import { petQueryKeys } from '../api/pet-query-keys';
import { updatePet } from '../api/update-pet';
import {
  PetImageField,
  type PetImageChange,
} from '../components/pet-image-field';
import { isPetOwner } from '../utils/is-pet-owner';

const petFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'form.validation.nameRequired')
    .max(PET_NAME_MAX_LENGTH, 'form.validation.nameTooLong'),
  species: z.enum(PET_SPECIES),
  age: z
    .string()
    .trim()
    .min(1, 'form.validation.ageRequired')
    .refine(
      (value) => Number.isInteger(Number(value)) && Number(value) >= 0,
      'form.validation.ageInvalid',
    )
    .transform(Number),
  description: z
    .string()
    .trim()
    .min(1, 'form.validation.descriptionRequired')
    .max(PET_DESCRIPTION_MAX_LENGTH, 'form.validation.descriptionTooLong'),
});

type FormValues = z.input<typeof petFormSchema>;
type FieldName = keyof FormValues;

const initialValues: FormValues = {
  name: '',
  species: 'dog',
  age: '',
  description: '',
};

const inputClassName =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring';

const PetFormPage = () => {
  const { t } = useTranslation('pets');
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { id } = useParams();
  const isEditing = Boolean(id);
  const { data: currentUser, isPending: isUserPending } = useCurrentUser();

  const [values, setValues] = useState<FormValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<FieldName, string>>
  >({});
  const [imageChange, setImageChange] = useState<PetImageChange>({
    kind: 'keep',
  });

  const {
    data: existingPet,
    isPending: isPetPending,
    isError: isPetError,
  } = useQuery({
    queryKey: petQueryKeys.detail(id ?? ''),
    queryFn: () => {
      if (!id) {
        throw new Error('Pet ID is required');
      }

      return getPet(id);
    },
    enabled: isEditing,
  });

  useEffect(() => {
    if (!existingPet) {
      return;
    }

    setValues({
      name: existingPet.name,
      species: existingPet.species,
      age: String(existingPet.age),
      description: existingPet.description,
    });
    setFieldErrors({});
  }, [existingPet]);

  const mutation = useMutation({
    meta: { skipGlobalErrorToast: true },

    // The pet is saved first; the photo needs the pet's id. If only the photo
    // step fails, the pet stays saved and the user is told about the photo.
    mutationFn: async ({
      input,
      image,
    }: {
      input: CreatePetInput;
      image: PetImageChange;
    }) => {
      const pet = id ? await updatePet(id, input) : await createPet(input);

      try {
        if (image.kind === 'upload') {
          await uploadPetImage(pet._id, image.file);
        } else if (image.kind === 'remove') {
          await deletePetImage(pet._id);
        }
      } catch (imageError) {
        return { pet, imageError };
      }

      return { pet, imageError: null };
    },

    onSuccess: async ({ pet, imageError }) => {
      // Every list page and this pet's detail may have changed.
      await queryClient.invalidateQueries({ queryKey: petQueryKeys.all });

      if (imageError) {
        toast.error(
          t('form.imageSaveFailed', {
            reason: getErrorMessage(imageError, t('form.imageSaveError')),
          }),
        );
      } else {
        toast.success(
          isEditing ? t('form.updateSuccess') : t('form.createSuccess'),
        );
      }

      navigate(`/pets/${pet._id}`);
    },
  });

  const updateField = (field: FieldName, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    mutation.reset();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFieldErrors({});
    mutation.reset();

    const result = petFormSchema.safeParse(values);

    if (!result.success) {
      const errors: Partial<Record<FieldName, string>> = {};

      for (const issue of result.error.issues) {
        const field = issue.path[0] as FieldName;

        if (!errors[field]) {
          errors[field] = t(issue.message);
        }
      }

      setFieldErrors(errors);
      return;
    }

    // Always send the full pet (PUT replaces it); the photo is separate.
    mutation.mutate({ input: result.data, image: imageChange });
  };

  // Server-side validation errors are derived from the mutation, so they are
  // cleared automatically by `mutation.reset()`.
  const serverFieldErrors = getFieldErrors(mutation.error);

  const getFieldError = (field: FieldName) =>
    fieldErrors[field] ?? serverFieldErrors[field];

  const errorMessage = mutation.error
    ? getErrorMessage(
        mutation.error,
        isEditing ? t('form.updateError') : t('form.submitError'),
      )
    : null;

  if (isUserPending || (isEditing && isPetPending)) {
    return <p>{t('loading')}</p>;
  }

  // Signed out (or the session expired during a save): sign in, then return.
  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (isEditing && (isPetError || !existingPet)) {
    return <p>{t('notFound')}</p>;
  }

  if (existingPet && !isPetOwner(existingPet, currentUser)) {
    return (
      <section className="space-y-4">
        <p>{t('form.notOwner')}</p>

        <Button asChild variant="outline">
          <Link to={`/pets/${existingPet._id}`}>{t('form.cancel')}</Link>
        </Button>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          {isEditing ? t('form.editTitle') : t('form.title')}
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          {t('form.subtitle')}
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium">
            {t('form.fields.name')}
          </label>
          <input
            id="name"
            name="name"
            value={values.name}
            onChange={(event) => updateField('name', event.target.value)}
            maxLength={PET_NAME_MAX_LENGTH}
            required
            aria-invalid={Boolean(getFieldError('name'))}
            aria-describedby={getFieldError('name') ? 'name-error' : undefined}
            className={inputClassName}
            placeholder={t('form.placeholders.name')}
          />
          {getFieldError('name') && (
            <p id="name-error" className="text-sm text-destructive">
              {getFieldError('name')}
            </p>
          )}
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="species" className="text-sm font-medium">
              {t('form.fields.species')}
            </label>
            <select
              id="species"
              name="species"
              value={values.species}
              onChange={(event) => updateField('species', event.target.value)}
              className={inputClassName}
            >
              {PET_SPECIES.map((species) => (
                <option key={species} value={species}>
                  {t(`species.${species}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="age" className="text-sm font-medium">
              {t('form.fields.age')}
            </label>
            <input
              id="age"
              name="age"
              type="number"
              min="0"
              step="1"
              value={values.age}
              onChange={(event) => updateField('age', event.target.value)}
              required
              aria-invalid={Boolean(getFieldError('age'))}
              aria-describedby={getFieldError('age') ? 'age-error' : undefined}
              className={inputClassName}
              placeholder={t('form.placeholders.age')}
            />
            {getFieldError('age') && (
              <p id="age-error" className="text-sm text-destructive">
                {getFieldError('age')}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="description" className="text-sm font-medium">
            {t('form.fields.description')}
          </label>
          <textarea
            id="description"
            name="description"
            value={values.description}
            onChange={(event) => updateField('description', event.target.value)}
            maxLength={PET_DESCRIPTION_MAX_LENGTH}
            rows={5}
            required
            aria-invalid={Boolean(getFieldError('description'))}
            aria-describedby={
              getFieldError('description') ? 'description-error' : undefined
            }
            className={inputClassName}
            placeholder={t('form.placeholders.description')}
          />
          {getFieldError('description') && (
            <p id="description-error" className="text-sm text-destructive">
              {getFieldError('description')}
            </p>
          )}
        </div>

        <PetImageField
          currentImageUrl={existingPet?.imageUrl ?? null}
          change={imageChange}
          onChange={(change) => {
            setImageChange(change);
            mutation.reset();
          }}
        />

        {errorMessage && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mutation.isPending
              ? t('form.submitting')
              : isEditing
                ? t('form.saveChanges')
                : t('form.submit')}
          </button>

          <Link
            to={isEditing ? `/pets/${id}` : '/pets'}
            className="inline-flex items-center justify-center rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            {t('form.cancel')}
          </Link>
        </div>
      </form>
    </section>
  );
};

export { PetFormPage };
