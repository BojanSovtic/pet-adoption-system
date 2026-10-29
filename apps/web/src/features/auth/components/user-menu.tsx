import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

import { logout } from '../api/logout';
import { useCurrentUser } from '../hooks/use-current-user';
import { setCurrentUser } from '../utils/set-current-user';

const UserMenu = () => {
  const { t } = useTranslation('auth');
  const queryClient = useQueryClient();
  const { data: currentUser, isPending } = useCurrentUser();

  // Errors are shown by the global mutation toast.
  const logoutMutation = useMutation({
    mutationFn: () => logout(),
    onSuccess: () => {
      setCurrentUser(queryClient, null);
      toast.success(t('logout.success'));
    },
  });

  // Avoid flashing "Sign in" while the session is being checked.
  if (isPending) {
    return null;
  }

  if (!currentUser) {
    return (
      <nav className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/login">{t('login.link')}</Link>
        </Button>
        <Button asChild size="sm">
          <Link to="/register">{t('register.link')}</Link>
        </Button>
      </nav>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {/* Shown to admins only for convenience; the API decides access. */}
      {currentUser.role === 'admin' && (
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin">{t('adminLink')}</Link>
        </Button>
      )}
      <Button asChild variant="ghost" size="sm">
        <Link to="/applications">{t('applicationsLink')}</Link>
      </Button>
      <Button asChild variant="ghost" size="sm">
        <Link to="/messages">{t('messagesLink')}</Link>
      </Button>
      <span className="hidden max-w-40 truncate text-sm font-medium text-muted-foreground sm:inline">
        {currentUser.name}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => logoutMutation.mutate()}
        disabled={logoutMutation.isPending}
      >
        {t('logout.button')}
      </Button>
    </div>
  );
};

export { UserMenu };
