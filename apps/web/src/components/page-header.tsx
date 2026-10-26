import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Main page actions, shown to the right on wider screens. */
  actions?: ReactNode;
};

/** The `<h1>` block every page starts with, so titles look the same everywhere. */
const PageHeader = ({ title, description, actions }: PageHeaderProps) => {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <h1 className="text-3xl sm:text-4xl">{title}</h1>
        {description && (
          <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
            {description}
          </p>
        )}
      </div>

      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {actions}
        </div>
      )}
    </header>
  );
};

export { PageHeader };
