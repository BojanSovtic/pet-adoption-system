import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Pet } from '@pet-adoption/models';

import { cn } from '@/lib/utils';

type PetGalleryProps = {
  pet: Pick<Pet, 'name' | 'images'>;
};

/**
 * The pet's photos: one large photo, plus thumbnail buttons to switch between
 * them when there is more than one. Renders nothing for a pet without photos.
 * Uses the same 4:3 ratio as the pet cards, so the photo isn't cropped differently.
 */
const PetGallery = ({ pet }: PetGalleryProps) => {
  const { t } = useTranslation('pets');
  const [selected, setSelected] = useState(0);
  const { images } = pet;

  if (images.length === 0) {
    return null;
  }

  // The list can shrink (e.g. a photo removed elsewhere); stay in range.
  const current = Math.min(selected, images.length - 1);
  const total = images.length;

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-lg border bg-muted shadow-card">
        <img
          src={images[current].url}
          alt={t('gallery.photoAlt', {
            name: pet.name,
            number: current + 1,
            total,
          })}
          className="aspect-[4/3] w-full object-cover"
        />

        {total > 1 && (
          // Visual only: the photo's alt text already says "photo X of Y".
          <span
            aria-hidden="true"
            className="absolute bottom-3 right-3 rounded-full bg-foreground/75 px-2.5 py-1 text-xs font-semibold tabular-nums text-background"
          >
            {current + 1} / {total}
          </span>
        )}
      </div>

      {total > 1 && (
        <ul
          aria-label={t('gallery.label', { name: pet.name })}
          className="grid grid-cols-5 gap-2"
        >
          {images.map((image, index) => (
            <li key={image._id}>
              <button
                type="button"
                onClick={() => setSelected(index)}
                aria-label={t('gallery.show', { number: index + 1, total })}
                aria-current={index === current ? 'true' : undefined}
                className={cn(
                  'block w-full cursor-pointer overflow-hidden rounded-md border-2 transition-opacity',
                  index === current
                    ? 'border-primary'
                    : 'border-transparent opacity-75 hover:opacity-100',
                )}
              >
                <img
                  src={image.url}
                  alt=""
                  className="aspect-[4/3] w-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export { PetGallery };
