import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Label } from './label';

describe('Label', () => {
  it('shows a required marker that is hidden from assistive technology', () => {
    render(
      <>
        <Label htmlFor="name" required>
          Name
        </Label>
        <input id="name" required />
      </>,
    );

    const marker = screen.getByText('*');
    expect(marker.getAttribute('aria-hidden')).toBe('true');
    // The field's name stays the label text; `required` is announced instead.
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect((input as HTMLInputElement).required).toBe(true);
  });

  it('shows no marker on optional fields', () => {
    render(<Label htmlFor="breed">Breed (optional)</Label>);

    expect(screen.queryByText('*')).toBeNull();
  });
});
