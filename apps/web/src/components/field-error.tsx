type FieldErrorProps = {
  /** Referenced from the control's `aria-describedby`. */
  id: string;
  message?: string;
};

/**
 * A field's validation message, shown below the control. Deliberately not a
 * live region: on submit, focus moves to the first invalid field and screen
 * readers read its description then, rather than announcing while typing.
 */
const FieldError = ({ id, message }: FieldErrorProps) =>
  message ? (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  ) : null;

export { FieldError };
