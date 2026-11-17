import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { MessageCircle, UserRound } from 'lucide-react';
import type { Pet } from '@pet-adoption/models';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { useCurrentUser } from '../../auth/hooks/use-current-user';
import { isPetOwner } from '../../pets/utils/is-pet-owner';
import { getUserProfile, userQueryKeys } from '../../users/api/users';
import {
  conversationQueryKeys,
  getConversations,
  messagePetOwner,
} from '../api/conversations';
import { MessageForm } from './message-form';

type PetContactSectionProps = {
  pet: Pet;
};

/**
 * "Listed by" on another user's pet: the owner's name, a link to their
 * profile, and a way to message them (or continue an earlier conversation).
 * Only for signed-in users who don't own the pet; the API enforces the same.
 */
const PetContactSection = ({ pet }: PetContactSectionProps) => {
  const { data: currentUser } = useCurrentUser();

  // Pets created before ownership existed have nobody to contact.
  if (!currentUser || !pet.owner || isPetOwner(pet, currentUser)) {
    return null;
  }

  return <OwnerContact pet={pet} />;
};

const OwnerContact = ({ pet }: PetContactSectionProps) => {
  const { t } = useTranslation('messages');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isWriting, setIsWriting] = useState(false);

  const owner = useQuery({
    queryKey: userQueryKeys.profile(pet.owner),
    queryFn: () => getUserProfile(pet.owner),
  });

  // At most one conversation exists per pet and adopter.
  const conversationQuery = { pet: pet._id, pageSize: 1 };
  const conversations = useQuery({
    queryKey: conversationQueryKeys.list(conversationQuery),
    queryFn: () => getConversations(conversationQuery),
  });

  const mutation = useMutation({
    // The form shows the error itself.
    meta: { skipGlobalErrorToast: true },
    mutationFn: (body: string) => messagePetOwner(pet._id, { body }),
    onSuccess: async (conversation) => {
      await queryClient.invalidateQueries({
        queryKey: conversationQueryKeys.all,
      });
      toast.success(t('form.sent'));
      navigate(`/messages/${conversation._id}`);
    },
  });

  const existing = conversations.data?.items[0];
  const ownerName = owner.data?.name;

  return (
    <section aria-labelledby="pet-contact-title" className="space-y-4">
      <div className="space-y-2">
        <h2
          id="pet-contact-title"
          className="text-sm font-medium text-muted-foreground"
        >
          {t('contact.title')}
        </h2>

        {owner.isPending ? (
          <Skeleton className="h-10 w-48" />
        ) : owner.isError ? (
          <p className="text-sm text-muted-foreground">
            {t('contact.ownerError')}
          </p>
        ) : (
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
              <UserRound aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold">{owner.data.name}</p>
              <Link
                to={`/users/${owner.data._id}`}
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                {t('contact.viewProfile')}
              </Link>
            </div>
          </div>
        )}
      </div>

      {conversations.isPending ? (
        <Skeleton className="h-10 w-full" />
      ) : existing ? (
        <Button asChild variant="outline" className="w-full">
          <Link to={`/messages/${existing._id}`}>
            <MessageCircle aria-hidden="true" />
            {t('contact.continue')}
          </Link>
        </Button>
      ) : pet.status === 'adopted' ? (
        <p className="text-sm text-muted-foreground">
          {t('contact.adoptedNotice', { pet: pet.name })}
        </p>
      ) : isWriting ? (
        <MessageForm
          id="contact-owner"
          label={
            ownerName
              ? t('form.toOwner', { name: ownerName })
              : t('contact.start')
          }
          hint={t('contact.hint')}
          mutation={mutation}
          autoFocus
          secondaryAction={
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                mutation.reset();
                setIsWriting(false);
              }}
            >
              {t('form.cancel')}
            </Button>
          }
        />
      ) : (
        // A failed lookup still lets the user write; the API decides.
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setIsWriting(true)}
        >
          <MessageCircle aria-hidden="true" />
          {t('contact.start')}
        </Button>
      )}
    </section>
  );
};

export { PetContactSection };
