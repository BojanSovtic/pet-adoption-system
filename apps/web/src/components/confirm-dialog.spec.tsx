import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import '../i18n/config';
import { ConfirmDialog } from './confirm-dialog';
import { Button } from './ui/button';

const renderDialog = (onConfirm: () => Promise<unknown>) =>
  render(
    <ConfirmDialog
      trigger={<Button>Remove</Button>}
      title="Remove Milo?"
      description="This cannot be undone."
      confirmLabel="Yes, remove"
      pendingLabel="Removing..."
      onConfirm={onConfirm}
    />,
  );

const open = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
  return screen.getByRole('alertdialog', { name: 'Remove Milo?' });
};

describe('ConfirmDialog', () => {
  it('starts on Cancel and returns focus to the trigger when cancelled', async () => {
    const onConfirm = vi.fn();
    renderDialog(onConfirm);

    open();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    expect(screen.getByText('This cannot be undone.')).toBeTruthy();

    fireEvent.click(cancel);

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Remove' }),
    );
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    renderDialog(vi.fn());

    fireEvent.keyDown(open(), { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('stays open and disabled while the action runs, then closes', async () => {
    let finish: () => void = () => undefined;
    const onConfirm = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    renderDialog(onConfirm);
    const dialog = open();

    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));

    const pending = await screen.findByRole('button', { name: 'Removing...' });
    expect((pending as HTMLButtonElement).disabled).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    // Escape can't interrupt a running action.
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.getByRole('alertdialog')).toBeTruthy();

    finish();

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('closes when the action fails (the global toast reports it)', async () => {
    renderDialog(vi.fn().mockRejectedValue(new Error('boom')));
    open();

    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});
