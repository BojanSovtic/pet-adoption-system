import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PET_IMAGE_MAX_BYTES,
  PET_IMAGE_MAX_COUNT,
  PET_IMAGE_TYPES,
  type PetImage,
  type PetImageType,
} from '@pet-adoption/models';

import { Button } from '@/components/ui/button';

/** What should happen to the photos when the form is saved. */
export type PetImagesChange = {
  /** Ids of existing photos to remove. */
  removeIds: string[];
  /** New files to add after the remaining photos. */
  add: File[];
};

export const NO_IMAGE_CHANGE: PetImagesChange = { removeIds: [], add: [] };

export const hasImageChange = ({ removeIds, add }: PetImagesChange): boolean =>
  removeIds.length > 0 || add.length > 0;

type PetImagesFieldProps = {
  /** The pet's current photos (when editing). */
  existingImages: PetImage[];
  change: PetImagesChange;
  onChange: (change: PetImagesChange) => void;
};

/** A message to show, as a translation key so it follows language changes. */
type Problem = { key: string; name?: string };

/**
 * Checks what the browser reports about a file. This is only for quick
 * feedback; the server checks the actual file content.
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

/** Temporary preview URLs for the chosen files, released when they change. */
const usePreviewUrls = (files: File[]): string[] => {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    const created = files.map((file) => URL.createObjectURL(file));
    setUrls(created);

    return () => created.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  return urls;
};

const tileClassName =
  'aspect-[4/3] w-full rounded-md border object-cover bg-muted';

const PetImagesField = ({
  existingImages,
  change,
  onChange,
}: PetImagesFieldProps) => {
  const { t } = useTranslation('pets');
  const inputRef = useRef<HTMLInputElement>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const previewUrls = usePreviewUrls(change.add);

  const keptImages = existingImages.filter(
    (image) => !change.removeIds.includes(image._id),
  );
  const total = keptImages.length + change.add.length;
  const isFull = total >= PET_IMAGE_MAX_COUNT;

  const tiles = [
    ...keptImages.map((image) => ({
      key: image._id,
      url: image.url,
      remove: () =>
        onChange({ ...change, removeIds: [...change.removeIds, image._id] }),
    })),
    ...change.add.map((file, index) => ({
      key: `new-${index}-${file.name}`,
      url: previewUrls[index],
      remove: () =>
        onChange({
          ...change,
          add: change.add.filter((_, fileIndex) => fileIndex !== index),
        }),
    })),
  ];

  const handleFiles = (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    const found: Problem[] = [];
    const accepted: File[] = [];

    for (const file of files) {
      const problem = validateFile(file);

      if (problem) {
        found.push({ key: problem, name: file.name });
      } else if (total + accepted.length < PET_IMAGE_MAX_COUNT) {
        accepted.push(file);
      } else {
        found.push({ key: 'form.validation.tooManyImages', name: file.name });
      }
    }

    setProblems(found);

    // Clear the input so the same files can be chosen again.
    if (inputRef.current) {
      inputRef.current.value = '';
    }

    if (accepted.length > 0) {
      onChange({ ...change, add: [...change.add, ...accepted] });
    }
  };

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{t('form.fields.images')}</legend>

      {tiles.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {tiles.map((tile, index) => (
            <li key={tile.key} className="space-y-1">
              {tile.url ? (
                <img
                  src={tile.url}
                  alt={t('form.imageAlt', { number: index + 1 })}
                  className={tileClassName}
                />
              ) : (
                <div className={tileClassName} />
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {index === 0 ? t('form.primaryImage') : null}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setProblems([]);
                    tile.remove();
                  }}
                  aria-label={t('form.removeImageNumber', {
                    number: index + 1,
                  })}
                >
                  {t('form.removeImage')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t('noImage')}</p>
      )}

      <div className="space-y-1">
        <label htmlFor="images" className="text-sm font-medium">
          {t('form.addImages')}
        </label>
        <input
          ref={inputRef}
          id="images"
          type="file"
          multiple
          accept={PET_IMAGE_TYPES.join(',')}
          disabled={isFull}
          onChange={(event) => handleFiles(event.target.files)}
          aria-invalid={problems.length > 0}
          aria-describedby={
            problems.length > 0 ? 'images-hint images-error' : 'images-hint'
          }
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-accent disabled:opacity-60"
        />
        <p id="images-hint" className="text-xs text-muted-foreground">
          {t('form.imageHint', { max: PET_IMAGE_MAX_COUNT })}{' '}
          {t('form.imageCount', { current: total, max: PET_IMAGE_MAX_COUNT })}
        </p>
      </div>

      {problems.length > 0 && (
        <ul id="images-error" className="space-y-1 text-sm text-destructive">
          {problems.map((problem, index) => (
            <li key={`${problem.name}-${index}`}>
              {problem.name ? `${problem.name}: ` : ''}
              {t(problem.key, { max: PET_IMAGE_MAX_COUNT })}
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
};

export { PetImagesField };
