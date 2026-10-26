/**
 * Shared look of text inputs, selects and textareas, so every form control
 * has the same height, border, focus and invalid state. Focus uses the
 * global `:focus-visible` outline; `aria-invalid` switches to the error colour.
 * `text-base` on mobile stops iOS Safari from zooming into focused fields.
 */
const fieldControlClassName =
  'w-full min-w-0 rounded-md border border-input bg-card px-3 text-base text-foreground transition-colors placeholder:text-muted-foreground hover:border-foreground/40 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:focus-visible:outline-destructive sm:text-sm';

export { fieldControlClassName };
