import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PetImage } from '@pet-adoption/models';

import '../../../i18n/config';
import { PetGallery } from './pet-gallery';

const image = (id: string): PetImage => ({
  _id: id,
  url: `http://localhost:3333/uploads/pets/${id}.jpg`,
});

describe('PetGallery', () => {
  it('shows the first photo and switches with the thumbnails', () => {
    render(
      <PetGallery pet={{ name: 'Milo', images: ['a', 'b', 'c'].map(image) }} />,
    );

    const main = screen.getByRole('img', { name: 'Milo, photo 1 of 3' });
    expect(main.getAttribute('src')).toBe(image('a').url);
    expect(
      screen
        .getByRole('button', { name: 'Show photo 1 of 3' })
        .getAttribute('aria-current'),
    ).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Show photo 2 of 3' }));

    expect(
      screen
        .getByRole('img', { name: 'Milo, photo 2 of 3' })
        .getAttribute('src'),
    ).toBe(image('b').url);
    expect(
      screen
        .getByRole('button', { name: 'Show photo 1 of 3' })
        .getAttribute('aria-current'),
    ).toBeNull();
  });

  it('shows a single photo without thumbnails', () => {
    render(<PetGallery pet={{ name: 'Milo', images: [image('a')] }} />);

    expect(
      screen.getByRole('img', { name: 'Milo, photo 1 of 1' }),
    ).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders nothing for a pet without photos', () => {
    const { container } = render(
      <PetGallery pet={{ name: 'Milo', images: [] }} />,
    );

    expect(container.innerHTML).toBe('');
  });
});
