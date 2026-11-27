import { useTranslation } from 'react-i18next';
import type { MyApplication, ReceivedApplication } from '@pet-adoption/models';

type RejectionNoteProps = {
  application: MyApplication | ReceivedApplication;
  actor: 'owner' | 'applicant';
};

/**
 * The owner's explanation for a rejected application, kept with it so the
 * applicant can come back to it. Applications rejected automatically or
 * before a reason was required have none; the applicant is told so, without
 * guessing a reason. The owner sees only the reason they wrote.
 */
const RejectionNote = ({ application, actor }: RejectionNoteProps) => {
  const { t } = useTranslation('applications');

  if (application.status !== 'rejected') {
    return null;
  }

  const { rejectionReason, pet } = application;

  if (!rejectionReason) {
    return actor === 'applicant' ? (
      <p className="text-sm text-muted-foreground">
        {pet.status === 'adopted'
          ? t('rejection.noReasonAdopted', { name: pet.name })
          : t('rejection.noReason')}
      </p>
    ) : null;
  }

  return (
    <figure className="space-y-1 rounded-md border-l-4 border-destructive/40 bg-muted px-4 py-3">
      <figcaption className="text-sm font-medium">
        {actor === 'applicant'
          ? t('rejection.ownerReason')
          : t('rejection.yourReason')}
      </figcaption>
      <blockquote className="text-sm leading-6 whitespace-pre-line">
        {rejectionReason}
      </blockquote>
    </figure>
  );
};

export { RejectionNote };
