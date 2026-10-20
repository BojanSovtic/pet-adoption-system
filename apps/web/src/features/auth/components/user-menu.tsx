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
        <Button asChild variant="ghost">
          <Link to="/login">{t('login.link')}</Link>
        </Button>
        <Button asChild>
          <Link to="/register">{t('register.link')}</Link>
        </Button>
      </nav>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Button asChild variant="ghost">
        <Link to="/applications">{t('applicationsLink')}</Link>
      </Button>
      <span className="text-sm text-muted-foreground">{currentUser.name}</span>
      <Button
        variant="outline"
        onClick={() => logoutMutation.mutate()}
        disabled={logoutMutation.isPending}
      >
        {t('logout.button')}
      </Button>
    </div>
  );
};

export { UserMenu };
