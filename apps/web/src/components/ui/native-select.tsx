import * as React from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

import { fieldControlClassName } from './field-control';

type NativeSelectProps = React.ComponentProps<'select'> & {
  /** Classes for the wrapper, e.g. width or grid placement. */
  containerClassName?: string;
};

/**
 * A styled native `<select>`: keeps the browser's keyboard, mobile and
 * screen-reader behaviour, and only replaces the arrow for a consistent look.
 */
const NativeSelect = ({
  className,
  containerClassName,
  ...props
}: NativeSelectProps) => {
  return (
    <div className={cn('relative', containerClassName)}>
      <select
        data-slot="native-select"
        className={cn(
          fieldControlClassName,
          'h-10 cursor-pointer appearance-none pr-9',
          className,
        )}
        {...props}
      />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
};

export { NativeSelect };
