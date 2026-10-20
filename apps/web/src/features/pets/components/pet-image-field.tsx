import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PET_IMAGE_MAX_BYTES,
  PET_IMAGE_TYPES,
  type PetImageType,
} from '@pet-adoption/models';

import { Button } from '@/components/ui/button';

/** What should happen to the photo when the form is saved. */
export type PetImageChange =
  { kind: 'keep' } | { kind: 'upload'; file: File } | { kind: 'remove' };

type PetImageFieldProps = {
  /** The pet's current photo (when editing). */
  currentImageUrl: string | null;
  change: PetImageChange;
  onChange: (change: PetImageChange) => void;
};

/**
 * Checks the file the browser reports. This is only for quick feedback; the
 * server checks the actual file content.
 */
const validateFile = (file: File): string | null => {
  if (!PET_IMAGE_TYPES.includes(file.type as PetImageType)) {
    return 'form.validation.imageType';
  }

  if (file.size > PET_IMAGE_MAX_BYTES) {
    return 'form.validation.imageTooLarge';
  }

  return null;
};

const PetImageField = ({
  currentImageUrl,
  change,
  onChange,
}: PetImageFieldProps) => {
  const { t } = useTranslation('pets');
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [previewUrl, setPreviewUrl] = useState<string>();

  const selectedFile = change.kind === 'upload' ? change.file : null;

  // A temporary URL for previewing the chosen file; released when replaced.
  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(undefined);
      return;
    }

    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  const shownImageUrl =
    previewUrl ?? (change.kind === 'keep' ? currentImageUrl : null);

  const handleFileChange = (file: File | undefined) => {
    if (!file) {
      return;
    }

    const problem = validateFile(file);

    if (problem) {
      setError(t(problem));
      // Clear the input so the same file can be chosen again.
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      return;
    }

    setError(undefined);
    onChange({ kind: 'upload', file });
  };

  const handleRemove = () => {
    setError(undefined);

    if (inputRef.current) {
      inputRef.current.value = '';
    }

    onChange(currentImageUrl ? { kind: 'remove' } : { kind: 'keep' });
  };

  return (
    <div className="space-y-2">
      <label htmlFor="image" className="text-sm font-medium">
        {t('form.fields.image')}
      </label>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {shownImageUrl ? (
          <img
            src={shownImageUrl}
            alt={t('form.imagePreview')}
            className="aspect-[4/3] w-full rounded-md border object-cover sm:w-48"
          />
        ) : (
          <div className="flex aspect-[4/3] w-full items-center justify-center rounded-md border bg-muted sm:w-48">
            <span className="text-sm text-muted-foreground">
              {t('noImage')}
            </span>
          </div>
        )}

        <div className="space-y-2">
          <input
            ref={inputRef}
            id="image"
            type="file"
            accept={PET_IMAGE_TYPES.join(',')}
            onChange={(event) => handleFileChange(event.target.files?.[0])}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'image-hint image-error' : 'image-hint'}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-accent"
          />
          <p id="image-hint" className="text-xs text-muted-foreground">
            {t('form.imageHint')}
          </p>

          {shownImageUrl && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRemove}
            >
              {t('form.removeImage')}
            </Button>
          )}

          {error && (
            <p id="image-error" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export { PetImageField };
