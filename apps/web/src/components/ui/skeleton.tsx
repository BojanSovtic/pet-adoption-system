import * as React from 'react';

import { cn } from '@/lib/utils';

/** Placeholder shape for loading content. Decorative: announce loading separately. */
const Skeleton = ({ className, ...props }: React.ComponentProps<'div'>) => {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('rounded-md bg-muted motion-safe:animate-pulse', className)}
      {...props}
    />
  );
};

export { Skeleton };
