import { useTranslation } from 'react-i18next';
import type { AdminAuditEntry } from '@pet-adoption/models';

import { Badge } from '@/components/ui/badge';

import { formatDate } from '../../../lib/format-date';

/** i18next splits keys on ".", so actions are stored as "user_role_changed". */
export const auditActionKey = (action: string): string =>
  action.replaceAll('.', '_');

/** One audit entry as a sentence ("Ana suspended Marko"), with its details. */
const AuditEntryItem = ({ entry }: { entry: AdminAuditEntry }) => {
  const { t, i18n } = useTranslation('admin');
  const { t: tCommon } = useTranslation('common');
  const { metadata } = entry;

  const sentence = t(`audit.events.${auditActionKey(entry.action)}`, {
    actor: entry.actor?.name ?? t('audit.commandLine'),
    target: entry.targetUser?.name ?? t('audit.deletedUser'),
    pet: entry.targetPet?.name ?? t('audit.deletedPet'),
    from: metadata.from ? t(`roles.${metadata.from}`) : '',
    to: metadata.to ? t(`roles.${metadata.to}`) : '',
  });

  const details = [
    metadata.reason ? t('audit.reason', { reason: metadata.reason }) : null,
    entry.outcome === 'denied' && metadata.code
      ? tCommon(`errors.${metadata.code}`, { defaultValue: metadata.code })
      : null,
    metadata.resultCount !== undefined
      ? t('audit.viewDetails', {
          page: metadata.page ?? 1,
          count: metadata.resultCount,
        })
      : null,
  ].filter(Boolean);

  return (
    <li className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between sm:gap-4">
      <div className="min-w-0 space-y-0.5">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          {entry.outcome === 'denied' && (
            <Badge variant="destructive">{t('audit.outcome.denied')}</Badge>
          )}
          <span>{sentence}</span>
        </p>
        {details.length > 0 && (
          <p className="text-sm break-words text-muted-foreground">
            {details.join(' · ')}
          </p>
        )}
      </div>
      <time
        dateTime={entry.createdAt}
        className="shrink-0 text-sm text-muted-foreground"
      >
        {formatDate(entry.createdAt, i18n.language)}
      </time>
    </li>
  );
};

export { AuditEntryItem };
