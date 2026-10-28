import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { Paginated, Pet } from '@pet-adoption/models';

import { Button } from '@/components/ui/button';

import { deletePet } from '../api/delete-pet';
import { petQueryKeys } from '../api/pet-query-keys';

type DeletePetButtonProps = {
  pet: Pet;
};

const DeletePetButton = ({ pet }: DeletePetButtonProps) => {
  const { t } = useTranslation('pets');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isConfirming, setIsConfirming] = useState(false);

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
      navigate('/pets', { replace: true });
      queryClient.removeQueries({ queryKey: petQueryKeys.detail(pet._id) });

      toast.success(t('delete.success', { name: pet.name }));
    },

    onError: () => {
      setIsConfirming(false);
    },
  });

  if (!isConfirming) {
    return (
      <Button variant="destructive" onClick={() => setIsConfirming(true)}>
        {t('delete.button')}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-sm font-medium">
        {t('delete.confirmQuestion', { name: pet.name })}
      </p>

      <Button
        variant="destructive"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
      >
        {mutation.isPending ? t('delete.deleting') : t('delete.confirm')}
      </Button>

      <Button
        variant="outline"
        onClick={() => setIsConfirming(false)}
        disabled={mutation.isPending}
      >
        {t('delete.cancel')}
      </Button>
    </div>
  );
};

export { DeletePetButton };
