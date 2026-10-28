import * as React from 'react';

import { cn } from '@/lib/utils';

import { fieldControlClassName } from './field-control';

const Textarea = ({
  className,
  ...props
}: React.ComponentProps<'textarea'>) => {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        fieldControlClassName,
        'min-h-24 py-2 leading-6',
        className,
      )}
      {...props}
    />
  );
};

export { Textarea };
