import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';

type PaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Accessible name; needs to be unique when a page has several lists. */
  label?: string;
};

/** Previous / "Page X of Y" / Next. Renders nothing for a single page. */
const Pagination = ({
  page,
  totalPages,
  onPageChange,
  label,
}: PaginationProps) => {
  const { t } = useTranslation('common');

  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav
      aria-label={label ?? t('pagination.label')}
      className="flex items-center justify-center gap-3 pt-2 sm:gap-4"
    >
      <Button
        variant="outline"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft aria-hidden="true" />
        {t('pagination.previous')}
      </Button>
      <span className="text-sm font-medium tabular-nums text-muted-foreground">
        {t('pagination.pageOf', { page, totalPages })}
      </span>
      <Button
        variant="outline"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        {t('pagination.next')}
        <ChevronRight aria-hidden="true" />
      </Button>
    </nav>
  );
};

export { Pagination };
