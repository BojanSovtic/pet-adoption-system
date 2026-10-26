import * as React from 'react';

import { cn } from '@/lib/utils';

import { fieldControlClassName } from './field-control';

const Input = ({
  className,
  type = 'text',
  ...props
}: React.ComponentProps<'input'>) => {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(fieldControlClassName, 'h-10', className)}
      {...props}
    />
  );
};

export { Input };
