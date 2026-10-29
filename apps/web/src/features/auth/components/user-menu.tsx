import { useEffect, useId, useRef, useState, type FocusEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ChevronDown,
  ClipboardList,
  LogOut,
  MessagesSquare,
  PawPrint,
  Plus,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import type { User } from '@pet-adoption/models';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { logout } from '../api/logout';
import { useCurrentUser } from '../hooks/use-current-user';
import { setCurrentUser } from '../utils/set-current-user';

const itemClassName =
  'flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm font-medium hover:bg-muted aria-[current=page]:bg-secondary aria-[current=page]:text-secondary-foreground';

type MenuLink = { to: string; label: string; icon: LucideIcon };

/**
 * The signed-in user's account menu: a button that shows and hides a list of
 * links (the disclosure pattern for site navigation, so the links stay plain
 * links). Closes on Escape (focus returns to the button), on a click or tap
 * outside, when focus leaves it, and after navigating or signing out.
 */
const AccountMenu = ({ user }: { user: User }) => {
  const { t } = useTranslation('auth');
  const queryClient = useQueryClient();
  const location = useLocation();
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // The path the menu was opened on: navigating anywhere closes it, without
  // an effect that resets state.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const isOpen = openedOn === location.pathname;
  const close = () => setOpenedOn(null);

  // Errors are shown by the global mutation toast.
  const logoutMutation = useMutation({
    mutationFn: () => logout(),
    onSuccess: () => {
      setCurrentUser(queryClient, null);
      toast.success(t('logout.success'));
    },
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpenedOn(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenedOn(null);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Tabbing out of the menu closes it, so it never hides the page behind.
  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      close();
    }
  };

  const links: MenuLink[] = [
    { to: '/my-pets', label: t('menu.myPets'), icon: PawPrint },
    { to: '/pets/new', label: t('menu.addPet'), icon: Plus },
    { to: '/applications', label: t('menu.applications'), icon: ClipboardList },
    { to: '/messages', label: t('menu.messages'), icon: MessagesSquare },
    { to: `/users/${user._id}`, label: t('menu.profile'), icon: UserRound },
    // Shown to admins only for convenience; the API decides access.
    ...(user.role === 'admin'
      ? [{ to: '/admin', label: t('adminLink'), icon: ShieldCheck }]
      : []),
  ];

  return (
    <div ref={containerRef} className="relative" onBlur={handleBlur}>
      <Button
        ref={buttonRef}
        variant="ghost"
        size="sm"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => setOpenedOn(isOpen ? null : location.pathname)}
        className="max-w-56"
      >
        <UserRound aria-hidden="true" />
        <span className="sr-only">{t('menu.label')}: </span>
        <span className="truncate">{user.name}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn('transition-transform', isOpen && 'rotate-180')}
        />
      </Button>

      <div
        id={menuId}
        hidden={!isOpen}
        className="absolute right-0 top-full z-40 mt-2 w-60 rounded-md border bg-card p-1 shadow-raised"
      >
        <nav aria-label={t('menu.label')}>
          <ul>
            {links.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink to={to} end className={itemClassName} onClick={close}>
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="my-1 border-t" />
        <button
          type="button"
          className={itemClassName}
          disabled={logoutMutation.isPending}
          onClick={() => {
            close();
            logoutMutation.mutate();
          }}
        >
          <LogOut aria-hidden="true" className="size-4 shrink-0" />
          {t('logout.button')}
        </button>
      </div>
    </div>
  );
};

const UserMenu = () => {
  const { t } = useTranslation('auth');
  const { data: currentUser, isPending } = useCurrentUser();

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

  return <AccountMenu user={currentUser} />;
};

export { UserMenu };
