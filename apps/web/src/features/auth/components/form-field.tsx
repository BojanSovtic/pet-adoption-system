import type { ComponentProps } from 'react';

import { Label } from '@/components/ui/label';

type FormFieldProps = ComponentProps<'input'> & {
  id: string;
  label: string;
  /** Shown below the label before the user types (e.g. a length rule). */
  hint?: string;
  error?: string;
};

const inputClassName =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring';

const FormField = ({
  id,
  label,
  hint,
  error,
  required,
  ...inputProps
}: FormFieldProps) => {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="space-y-2">
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {hint && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      <input
        id={id}
        name={id}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={inputClassName}
        {...inputProps}
      />
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
};

export { FormField };
