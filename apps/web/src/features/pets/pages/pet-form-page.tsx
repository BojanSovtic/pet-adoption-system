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
  DEFAULT_PET_PROFILE,
  PET_ALONE_TIME_VALUES,
  PET_BREED_MAX_LENGTH,
  PET_COMPATIBILITY_TARGETS,
  PET_COMPATIBILITY_VALUES,
  PET_DESCRIPTION_MAX_LENGTH,
  PET_NAME_MAX_LENGTH,
  PET_SEXES,
  PET_SPECIES,
  type CreatePetInput,
  type PetCompatibilityTarget,
} from '@pet-adoption/models';

import { PageHeader } from '@/components/page-header';
import { RequiredFieldsNote } from '@/components/required-fields-note';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

import { ApiError } from '../../../lib/api-client';
import {
  getErrorMessage,
  getFieldErrors,
} from '../../../lib/get-error-message';
import { useCurrentUser } from '../../auth/hooks/use-current-user';
import { createPet } from '../api/create-pet';
import { getPet } from '../api/get-pet';
import { addPetImages, deletePetImage } from '../api/pet-image';
import { petQueryKeys } from '../api/pet-query-keys';
import { updatePet } from '../api/update-pet';
import {
  NO_IMAGE_CHANGE,
  PetImagesField,
  type PetImagesChange,
} from '../components/pet-images-field';
import { isPetOwner } from '../utils/is-pet-owner';

// Load errors that mean "there is no such pet" (a malformed id included).
const NOT_FOUND_CODES = ['PET_NOT_FOUND', 'INVALID_PET_ID'];

// The form keeps every value flat (one state key per control); the submit
// handler builds the nested API input from it.
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
  sex: z.enum(PET_SEXES),
  breed: z
    .string()
    .trim()
    .max(PET_BREED_MAX_LENGTH, 'form.validation.breedTooLong'),
  children: z.enum(PET_COMPATIBILITY_VALUES),
  dogs: z.enum(PET_COMPATIBILITY_VALUES),
  cats: z.enum(PET_COMPATIBILITY_VALUES),
  aloneTime: z.enum(PET_ALONE_TIME_VALUES),
});

type FormValues = z.input<typeof petFormSchema>;
type FieldName = keyof FormValues;

const initialValues: FormValues = {
  name: '',
  species: 'dog',
  age: '',
  description: '',
  sex: DEFAULT_PET_PROFILE.sex,
  breed: DEFAULT_PET_PROFILE.breed,
  ...DEFAULT_PET_PROFILE.compatibility,
  aloneTime: DEFAULT_PET_PROFILE.aloneTime,
};

const toPetInput = ({
  children,
  dogs,
  cats,
  ...rest
}: z.output<typeof petFormSchema>): CreatePetInput => ({
  ...rest,
  compatibility: { children, dogs, cats },
});

const isCompatibilityField = (
  field: FieldName,
): field is PetCompatibilityTarget =>
  (PET_COMPATIBILITY_TARGETS as readonly string[]).includes(field);

// A native legend sits on the fieldset border; floating it puts it inside
// the card like a heading (the content after it uses `clear-both`).
const legendClassName = 'float-left mb-4 w-full text-lg font-semibold';

const FieldError = ({ id, message }: { id: string; message?: string }) =>
  message ? (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  ) : null;

const PetFormPage = () => {
  const { t } = useTranslation('pets');
  const { t: tCommon } = useTranslation('common');
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
  const [imageChange, setImageChange] =
    useState<PetImagesChange>(NO_IMAGE_CHANGE);

  const {
    data: existingPet,
    isPending: isPetPending,
    isError: isPetError,
    error: petError,
    isFetching: isPetFetching,
    refetch: refetchPet,
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
      sex: existingPet.sex,
      breed: existingPet.breed,
      ...existingPet.compatibility,
      aloneTime: existingPet.aloneTime,
    });
    setFieldErrors({});
  }, [existingPet]);

  const mutation = useMutation({
    meta: { skipGlobalErrorToast: true },

    // The pet is saved first; photos need the pet's id. Removals run before
    // additions, so freed slots can be reused within the 5-photo limit. If a photo
    // step fails, the pet stays saved and the user is told about the photos.
    mutationFn: async ({
      input,
      images,
    }: {
      input: CreatePetInput;
      images: PetImagesChange;
    }) => {
      const pet = id ? await updatePet(id, input) : await createPet(input);

      try {
        for (const imageId of images.removeIds) {
          await deletePetImage(pet._id, imageId);
        }

        if (images.add.length > 0) {
          await addPetImages(pet._id, images.add);
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

      // Keep the list state the edit page was opened with (see "Back to pets").
      navigate(`/pets/${pet._id}`, { state: location.state });
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

        // A translation key; translated on render so a language change applies.
        if (!errors[field]) {
          errors[field] = issue.message;
        }
      }

      setFieldErrors(errors);
      return;
    }

    // Always send the full pet (PUT replaces it); photos are saved separately.
    mutation.mutate({ input: toPetInput(result.data), images: imageChange });
  };

  // Server-side validation errors are derived from the mutation, so they are
  // cleared automatically by `mutation.reset()`.
  const serverFieldErrors = getFieldErrors(mutation.error);

  const getFieldError = (field: FieldName) => {
    const key = fieldErrors[field];
    // The API reports nested fields with their path ("compatibility.dogs").
    const serverField = isCompatibilityField(field)
      ? `compatibility.${field}`
      : field;

    return key ? t(key) : serverFieldErrors[serverField];
  };

  // Props shared by every control: value, change handler and error wiring.
  const controlProps = (field: FieldName, describedBy?: string) => {
    const error = getFieldError(field);
    const ids = [describedBy, error ? `${field}-error` : undefined]
      .filter(Boolean)
      .join(' ');

    return {
      id: field,
      name: field,
      value: values[field],
      'aria-invalid': Boolean(error),
      'aria-describedby': ids || undefined,
    };
  };

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
    // Only a missing pet is "not found"; network and server errors may pass,
    // so they get the real reason and a retry.
    const isMissing =
      petError instanceof ApiError && NOT_FOUND_CODES.includes(petError.code);

    return (
      <section className="space-y-4">
        <p role="alert">
          {isMissing
            ? t('notFound')
            : getErrorMessage(petError, t('form.loadError'))}
        </p>

        <div className="flex gap-3">
          {!isMissing && (
            <Button
              variant="outline"
              onClick={() => void refetchPet()}
              disabled={isPetFetching}
            >
              {tCommon('actions.retry')}
            </Button>
          )}
          <Button asChild variant="outline">
            <Link to="/pets">{t('backToPets')}</Link>
          </Button>
        </div>
      </section>
    );
  }

  if (existingPet && !isPetOwner(existingPet, currentUser)) {
    return (
      <section className="space-y-4">
        <p>{t('form.notOwner')}</p>

        <Button asChild variant="outline">
          <Link to={`/pets/${existingPet._id}`} state={location.state}>
            {t('form.cancel')}
          </Link>
        </Button>
      </section>
    );
  }

  const compatibilityOptions = PET_COMPATIBILITY_VALUES.map((value) => (
    <option key={value} value={value}>
      {t(`form.compatibilityOptions.${value}`)}
    </option>
  ));

  return (
    <section className="mx-auto w-full max-w-2xl space-y-8">
      <PageHeader
        title={isEditing ? t('form.editTitle') : t('form.title')}
        description={t('form.subtitle')}
      />

      <form onSubmit={handleSubmit} noValidate className="space-y-8">
        <RequiredFieldsNote />

        <fieldset className="rounded-lg border bg-card p-6 shadow-card">
          <legend className={legendClassName}>
            {t('form.sections.basics')}
          </legend>

          <div className="clear-both space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name" required>
                {t('form.fields.name')}
              </Label>
              <Input
                {...controlProps('name')}
                onChange={(event) => updateField('name', event.target.value)}
                maxLength={PET_NAME_MAX_LENGTH}
                required
                placeholder={t('form.placeholders.name')}
              />
              <FieldError id="name-error" message={getFieldError('name')} />
            </div>

            <div className="grid gap-6 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="species" required>
                  {t('form.fields.species')}
                </Label>
                <NativeSelect
                  {...controlProps('species')}
                  required
                  onChange={(event) =>
                    updateField('species', event.target.value)
                  }
                >
                  {PET_SPECIES.map((species) => (
                    <option key={species} value={species}>
                      {t(`species.${species}`)}
                    </option>
                  ))}
                </NativeSelect>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sex">{t('form.fields.sex')}</Label>
                <NativeSelect
                  {...controlProps('sex')}
                  onChange={(event) => updateField('sex', event.target.value)}
                >
                  {PET_SEXES.map((sex) => (
                    <option key={sex} value={sex}>
                      {t(`sex.${sex}`)}
                    </option>
                  ))}
                </NativeSelect>
              </div>

              <div className="space-y-2">
                <Label htmlFor="age" required>
                  {t('form.fields.age')}
                </Label>
                <Input
                  {...controlProps('age')}
                  onChange={(event) => updateField('age', event.target.value)}
                  type="number"
                  min="0"
                  step="1"
                  required
                  placeholder={t('form.placeholders.age')}
                />
                <FieldError id="age-error" message={getFieldError('age')} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="breed">{t('form.fields.breed')}</Label>
              <Input
                {...controlProps('breed', 'breed-hint')}
                onChange={(event) => updateField('breed', event.target.value)}
                maxLength={PET_BREED_MAX_LENGTH}
              />
              <p id="breed-hint" className="text-sm text-muted-foreground">
                {t('form.hints.breed')}
              </p>
              <FieldError id="breed-error" message={getFieldError('breed')} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" required>
                {t('form.fields.description')}
              </Label>
              <Textarea
                {...controlProps('description')}
                onChange={(event) =>
                  updateField('description', event.target.value)
                }
                maxLength={PET_DESCRIPTION_MAX_LENGTH}
                rows={5}
                required
                placeholder={t('form.placeholders.description')}
              />
              <FieldError
                id="description-error"
                message={getFieldError('description')}
              />
            </div>
          </div>
        </fieldset>

        <fieldset
          aria-describedby="lifestyle-hint"
          className="rounded-lg border bg-card p-6 shadow-card"
        >
          <legend className={legendClassName}>
            {t('form.sections.lifestyle')}
          </legend>

          <div className="clear-both space-y-6">
            <p id="lifestyle-hint" className="text-sm text-muted-foreground">
              {t('form.hints.lifestyle')}
            </p>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">
                {t('form.fields.goodWith')}
              </legend>
              <div className="grid gap-4 sm:grid-cols-3">
                {PET_COMPATIBILITY_TARGETS.map((target) => (
                  <div key={target} className="space-y-2">
                    <Label htmlFor={target} className="font-normal">
                      {t(`lifestyle.${target}`)}
                    </Label>
                    <NativeSelect
                      {...controlProps(target)}
                      onChange={(event) =>
                        updateField(target, event.target.value)
                      }
                    >
                      {compatibilityOptions}
                    </NativeSelect>
                  </div>
                ))}
              </div>
            </fieldset>

            <div className="space-y-2 sm:max-w-xs">
              <Label htmlFor="aloneTime">{t('form.fields.aloneTime')}</Label>
              <NativeSelect
                {...controlProps('aloneTime')}
                onChange={(event) =>
                  updateField('aloneTime', event.target.value)
                }
              >
                {PET_ALONE_TIME_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {value === 'unknown'
                      ? t('form.compatibilityOptions.unknown')
                      : t(`aloneTime.${value}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
        </fieldset>

        <PetImagesField
          existingImages={existingPet?.images ?? []}
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
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending
              ? t('form.submitting')
              : isEditing
                ? t('form.saveChanges')
                : t('form.submit')}
          </Button>

          <Button asChild variant="outline">
            <Link
              to={isEditing ? `/pets/${id}` : '/pets'}
              state={isEditing ? location.state : undefined}
            >
              {t('form.cancel')}
            </Link>
          </Button>
        </div>
      </form>
    </section>
  );
};

export { PetFormPage };
