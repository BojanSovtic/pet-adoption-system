import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

type StateMessageProps = {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  /** Usually one Button (retry, clear filters…). */
  action?: ReactNode;
  /** `error` is announced to screen readers (`role="alert"`). */
  tone?: 'neutral' | 'error';
};

/** Empty and error states of a page or section. */
const StateMessage = ({
  title,
  description,
  icon: Icon,
  action,
  tone = 'neutral',
}: StateMessageProps) => {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-card px-6 py-12 text-center"
    >
      {Icon && (
        <span
          className={cn(
            'mb-1 flex size-12 items-center justify-center rounded-full',
            tone === 'error'
              ? 'bg-destructive-subtle text-destructive'
              : 'bg-secondary text-secondary-foreground',
          )}
        >
          <Icon aria-hidden="true" className="size-6" />
        </span>
      )}

      <p className="text-lg font-semibold">{title}</p>

      {description && (
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      )}

      {action && <div className="mt-2">{action}</div>}
    </div>
  );
};

export { StateMessage };
