import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Pet } from '@pet-adoption/models';

type PetGalleryProps = {
  pet: Pick<Pet, 'name' | 'images'>;
};

/**
 * The pet's photos: one large photo, plus thumbnail buttons to switch between
 * them when there is more than one. Renders nothing for a pet without photos.
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
    <div>
      <img
        src={images[current].url}
        alt={t('gallery.photoAlt', {
          name: pet.name,
          number: current + 1,
          total,
        })}
        className="aspect-[16/7] w-full object-cover"
      />

      {total > 1 && (
        <ul
          aria-label={t('gallery.label', { name: pet.name })}
          className="flex flex-wrap gap-2 px-6 pt-4"
        >
          {images.map((image, index) => (
            <li key={image._id}>
              <button
                type="button"
                onClick={() => setSelected(index)}
                aria-label={t('gallery.show', { number: index + 1, total })}
                aria-current={index === current ? 'true' : undefined}
                className={`block overflow-hidden rounded-md border-2 outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  index === current
                    ? 'border-primary'
                    : 'border-transparent opacity-80 hover:opacity-100'
                }`}
              >
                <img
                  src={image.url}
                  alt=""
                  className="h-16 w-20 object-cover sm:h-20 sm:w-28"
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
