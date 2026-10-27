import { useTranslation } from 'react-i18next';
import type { AdminUser } from '@pet-adoption/models';

import { reinstateUser, suspendUser, updateUserRole } from '../api/admin';
import { ConfirmAction } from './confirm-action';

type UserActionsProps = {
  user: AdminUser;
};

/**
 * What an admin may do to another user, mirroring the API rules: suspended
 * users can't be made admins, and admins can't be suspended (demote first).
 */
const UserActions = ({ user }: UserActionsProps) => {
  const { t } = useTranslation('admin');
  const isAdmin = user.role === 'admin';
  const isSuspended = Boolean(user.suspendedAt);
  const roleLabel = t(isAdmin ? 'users.removeAdmin' : 'users.makeAdmin');

  return (
    <div className="flex flex-wrap items-start gap-2">
      {!isSuspended && (
        <ConfirmAction
          label={roleLabel}
          accessibleName={`${roleLabel}: ${user.name}`}
          question={t(
            isAdmin ? 'users.confirmRemoveAdmin' : 'users.confirmMakeAdmin',
            { name: user.name },
          )}
          confirmLabel={t('users.confirm')}
          destructive={isAdmin}
          onConfirm={() =>
            updateUserRole(user._id, { role: isAdmin ? 'user' : 'admin' })
          }
          successMessage={t(
            isAdmin ? 'users.removedAdmin' : 'users.madeAdmin',
            {
              name: user.name,
            },
          )}
        />
      )}

      {isSuspended ? (
        <ConfirmAction
          label={t('users.reinstate')}
          accessibleName={`${t('users.reinstate')}: ${user.name}`}
          question={t('users.confirmReinstate', { name: user.name })}
          confirmLabel={t('users.confirmReinstateButton')}
          onConfirm={() => reinstateUser(user._id)}
          successMessage={t('users.reinstated', { name: user.name })}
        />
      ) : (
        !isAdmin && (
          <ConfirmAction
            label={t('users.suspend')}
            accessibleName={`${t('users.suspend')}: ${user.name}`}
            question={t('users.confirmSuspend', { name: user.name })}
            confirmLabel={t('users.confirmSuspendButton')}
            destructive
            withReason
            onConfirm={(reason) => suspendUser(user._id, { reason })}
            successMessage={t('users.suspended', { name: user.name })}
          />
        )
      )}
    </div>
  );
};

export { UserActions };
