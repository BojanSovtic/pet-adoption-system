import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { ScrollText, TriangleAlert } from 'lucide-react';
import {
  ADMIN_AUDIT_ACTIONS,
  ADMIN_LIST_DEFAULT_PAGE_SIZE,
} from '@pet-adoption/models';

import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { StateMessage } from '@/components/state-message';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { getErrorMessage } from '../../../lib/get-error-message';
import { adminQueryKeys, getAdminAudit } from '../api/admin';
import { AuditEntryItem, auditActionKey } from '../components/audit-entry-item';
import {
  readEnum,
  readPage,
  withListChanges,
} from '../utils/admin-list-params';

/** The admin audit log, newest first. Read-only: entries can't be changed. */
const AdminAuditPage = () => {
  const { t } = useTranslation('admin');
  const [searchParams, setSearchParams] = useSearchParams();
  const action = readEnum(searchParams, 'action', ADMIN_AUDIT_ACTIONS);
  const page = readPage(searchParams);

  const update = (changes: Record<string, string | number | undefined>) =>
    setSearchParams((current) => withListChanges(current, changes), {
      replace: true,
    });

  const query = { action, page, pageSize: ADMIN_LIST_DEFAULT_PAGE_SIZE };

  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    isFetching,
    isPlaceholderData,
  } = useQuery({
    queryKey: adminQueryKeys.audit(query),
    queryFn: () => getAdminAudit(query),
    placeholderData: keepPreviousData,
  });

  return (
    <section className="space-y-6">
      <PageHeader title={t('nav.audit')} description={t('audit.description')} />

      <div className="rounded-lg border bg-card p-3 shadow-card sm:max-w-sm">
        <NativeSelect
          value={action ?? ''}
          onChange={(event) => update({ action: event.target.value })}
          aria-label={t('audit.filterByAction')}
        >
          <option value="">{t('audit.allActions')}</option>
          {ADMIN_AUDIT_ACTIONS.map((value) => (
            <option key={value} value={value}>
              {t(`audit.actions.${auditActionKey(value)}`)}
            </option>
          ))}
        </NativeSelect>
      </div>

      {isPending ? (
        <Card className="gap-4 p-5">
          <p role="status" className="sr-only">
            {t('loading')}
          </p>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </Card>
      ) : isError ? (
        <StateMessage
          tone="error"
          icon={TriangleAlert}
          title={getErrorMessage(error, t('error'))}
          action={
            <Button variant="outline" onClick={() => void refetch()}>
              {t('common:actions.retry')}
            </Button>
          }
        />
      ) : data.items.length === 0 ? (
        <StateMessage icon={ScrollText} title={t('audit.empty')} />
      ) : (
        <div
          className={cn(
            'space-y-4 transition-opacity',
            isFetching && isPlaceholderData && 'opacity-60',
          )}
          aria-busy={isFetching}
        >
          <p
            className="text-sm font-medium text-muted-foreground"
            aria-live="polite"
          >
            {t('audit.resultCount', { count: data.totalItems })}
          </p>
          <Card className="py-0">
            <ul className="divide-y px-5">
              {data.items.map((entry) => (
                <AuditEntryItem key={entry._id} entry={entry} />
              ))}
            </ul>
          </Card>
          <Pagination
            page={page}
            totalPages={data.totalPages}
            onPageChange={(next) => update({ page: next })}
          />
        </div>
      )}
    </section>
  );
};

export { AdminAuditPage };
