import * as React from 'react';

import { cn } from '@/lib/utils';

const Label = ({ className, ...props }: React.ComponentProps<'label'>) => {
  return (
    <label
      data-slot="label"
      className={cn('block text-sm font-medium text-foreground', className)}
      {...props}
    />
  );
};

export { Label };
