import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Search, TriangleAlert, Users } from 'lucide-react';
import {
  ADMIN_LIST_DEFAULT_PAGE_SIZE,
  ADMIN_USER_STATUSES,
  USER_ROLES,
  type AdminUser,
} from '@pet-adoption/models';

import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { StateMessage } from '@/components/state-message';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { formatDate } from '../../../lib/format-date';
import { getErrorMessage } from '../../../lib/get-error-message';
import { useDebouncedValue } from '../../../lib/use-debounced-value';
import { useCurrentUser } from '../../auth/hooks/use-current-user';
import { adminQueryKeys, getAdminUsers } from '../api/admin';
import { UserActions } from '../components/user-actions';
import {
  readEnum,
  readPage,
  withListChanges,
} from '../utils/admin-list-params';

const SEARCH_DEBOUNCE_MS = 300;

const UserRow = ({ user, isSelf }: { user: AdminUser; isSelf: boolean }) => {
  const { t, i18n } = useTranslation('admin');

  return (
    <li className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 py-4">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{user.name}</span>
          <Badge variant={user.role === 'admin' ? 'secondary' : 'neutral'}>
            {t(`roles.${user.role}`)}
          </Badge>
          {user.suspendedAt && (
            <Badge variant="destructive">{t('users.status.suspended')}</Badge>
          )}
          {isSelf && <Badge variant="outline">{t('users.you')}</Badge>}
        </div>
        <p className="text-sm break-all text-muted-foreground">{user.email}</p>
        <p className="text-sm text-muted-foreground">
          {[
            t('users.joined', {
              date: formatDate(user.createdAt, i18n.language),
            }),
            t('users.petCount', { count: user.petCount }),
            t('users.applicationCount', { count: user.applicationCount }),
            user.suspendedAt
              ? t('users.suspendedOn', {
                  date: formatDate(user.suspendedAt, i18n.language),
                })
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      {isSelf ? (
        <p className="text-sm text-muted-foreground">
          {t('users.ownRoleHint')}
        </p>
      ) : (
        <UserActions user={user} />
      )}
    </li>
  );
};

const AdminUsersPage = () => {
  const { t } = useTranslation('admin');
  const { data: currentUser } = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const role = readEnum(searchParams, 'role', USER_ROLES);
  const status = readEnum(searchParams, 'status', ADMIN_USER_STATUSES);
  const page = readPage(searchParams);

  const update = (changes: Record<string, string | number | undefined>) =>
    setSearchParams((current) => withListChanges(current, changes), {
      replace: true,
    });

  // The input updates on every keystroke; the URL (and the request) after a pause.
  const [searchInput, setSearchInput] = useState(search);
  const debouncedSearch = useDebouncedValue(
    searchInput.trim(),
    SEARCH_DEBOUNCE_MS,
  );

  useEffect(() => {
    if (debouncedSearch !== search) {
      update({ search: debouncedSearch });
    }
    // Only react to the debounced text, not to every URL change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const query = {
    search: search || undefined,
    role,
    status,
    page,
    pageSize: ADMIN_LIST_DEFAULT_PAGE_SIZE,
  };

  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    isFetching,
    isPlaceholderData,
  } = useQuery({
    queryKey: adminQueryKeys.users(query),
    queryFn: () => getAdminUsers(query),
    placeholderData: keepPreviousData,
  });

  return (
    <section className="space-y-6">
      <PageHeader title={t('nav.users')} description={t('users.description')} />

      <div
        role="search"
        className="grid gap-3 rounded-lg border bg-card p-3 shadow-card sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_12rem]"
      >
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t('users.searchPlaceholder')}
            aria-label={t('users.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <NativeSelect
          value={role ?? ''}
          onChange={(event) => update({ role: event.target.value })}
          aria-label={t('users.filterByRole')}
        >
          <option value="">{t('users.allRoles')}</option>
          {USER_ROLES.map((value) => (
            <option key={value} value={value}>
              {t(`roles.${value}`)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={status ?? ''}
          onChange={(event) => update({ status: event.target.value })}
          aria-label={t('users.filterByStatus')}
        >
          <option value="">{t('users.allStatuses')}</option>
          {ADMIN_USER_STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`users.status.${value}`)}
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
            <Skeleton key={index} className="h-16 w-full" />
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
        <StateMessage icon={Users} title={t('users.empty')} />
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
            {t('users.resultCount', { count: data.totalItems })}
          </p>
          <Card className="py-0">
            <ul className="divide-y px-5">
              {data.items.map((user) => (
                <UserRow
                  key={user._id}
                  user={user}
                  isSelf={user._id === currentUser?._id}
                />
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

export { AdminUsersPage };
