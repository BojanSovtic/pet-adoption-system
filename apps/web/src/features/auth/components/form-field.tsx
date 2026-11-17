import type { ComponentProps } from 'react';

import { FieldError } from '@/components/field-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type FormFieldProps = ComponentProps<'input'> & {
  id: string;
  label: string;
  /** Shown below the label before the user types (e.g. a length rule). */
  hint?: string;
  error?: string;
};

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
      <Input
        id={id}
        name={id}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        {...inputProps}
      />
      <FieldError id={errorId} message={error} />
    </div>
  );
};

export { FormField };
