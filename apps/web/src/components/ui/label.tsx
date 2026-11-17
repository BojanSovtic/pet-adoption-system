import * as React from 'react';

import { cn } from '@/lib/utils';

type LabelProps = React.ComponentProps<'label'> & {
  /**
   * Adds the visible required marker (`*`) after the label. Also set
   * `required` on the control itself: that is what screen readers announce.
   * The marker sits outside the `<label>` and is hidden from assistive
   * technology, so the field's name stays exactly the label text.
   */
  required?: boolean;
};

const Label = ({ className, required, ...props }: LabelProps) => {
  const label = (
    <label
      data-slot="label"
      className={cn('block text-sm font-medium text-foreground', className)}
      {...props}
    />
  );

  if (!required) {
    return label;
  }

  return (
    <div className="flex items-baseline gap-0.5">
      {label}
      <span aria-hidden="true" className="text-sm font-medium text-destructive">
        *
      </span>
    </div>
  );
};

export { Label };
