import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { Paginated, Pet } from '@pet-adoption/models';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';

import { deletePet } from '../api/delete-pet';
import { petQueryKeys } from '../api/pet-query-keys';

type DeletePetButtonProps = {
  pet: Pet;
  /**
   * Where to go after deleting; `null` stays on the current page (e.g. My
   * pets, which drops the pet from its list). Default: the pet list.
   */
  redirectTo?: string | null;
  /** Smaller button for lists. */
  size?: 'default' | 'sm';
};

const DeletePetButton = ({
  pet,
  redirectTo = '/pets',
  size = 'default',
}: DeletePetButtonProps) => {
  const { t } = useTranslation('pets');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Errors are shown by the global mutation toast (see query-client.ts).
  const mutation = useMutation({
    mutationFn: () => deletePet(pet._id),

    onSuccess: () => {
      // Drop the pet from every cached list page so it never flashes, then mark
      // the lists stale: page boundaries shift, so they refetch when shown.
      queryClient.setQueriesData<Paginated<Pet>>(
        { queryKey: petQueryKeys.lists() },
        (page) =>
          page && {
            ...page,
            items: page.items.filter((item) => item._id !== pet._id),
          },
      );
      void queryClient.invalidateQueries({ queryKey: petQueryKeys.lists() });

      // `replace` keeps the deleted pet's page out of the browser history.
      if (redirectTo) {
        navigate(redirectTo, { replace: true });
      }
      queryClient.removeQueries({ queryKey: petQueryKeys.detail(pet._id) });

      toast.success(t('delete.success', { name: pet.name }));
    },
  });

  return (
    <ConfirmDialog
      trigger={
        <Button variant="destructive" size={size}>
          {t('delete.button')}
        </Button>
      }
      title={t('delete.title', { name: pet.name })}
      description={t('delete.description')}
      confirmLabel={t('delete.confirm')}
      pendingLabel={t('delete.deleting')}
      cancelLabel={t('delete.cancel')}
      onConfirm={() => mutation.mutateAsync()}
    />
  );
};

export { DeletePetButton };
