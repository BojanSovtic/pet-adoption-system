const isHidden = (element: HTMLElement): boolean => {
  if (element.closest('[hidden], [inert]')) {
    return true;
  }

  for (
    let node: HTMLElement | null = element;
    node;
    node = node.parentElement
  ) {
    const style = getComputedStyle(node);

    if (style.display === 'none' || style.visibility === 'hidden') {
      return true;
    }
  }

  return false;
};

const isFullyInViewport = (element: HTMLElement): boolean => {
  const { top, bottom } = element.getBoundingClientRect();

  return top >= 0 && bottom <= window.innerHeight;
};

/**
 * Moves keyboard focus to the first invalid control (`aria-invalid="true"`)
 * in `container`, in page order, skipping disabled and hidden ones. Scrolls
 * only when the control is not fully visible, then centres it so its label
 * and error message show too. No smooth scrolling.
 *
 * Call it after the errors have rendered. Returns whether a control was
 * focused.
 */
export const focusFirstInvalidField = (
  container: HTMLElement | null,
): boolean => {
  if (!container) {
    return false;
  }

  const target = Array.from(
    container.querySelectorAll<HTMLElement>('[aria-invalid="true"]'),
  ).find((element) => !element.matches(':disabled') && !isHidden(element));

  if (!target) {
    return false;
  }

  if (!isFullyInViewport(target)) {
    target.scrollIntoView({ block: 'center', behavior: 'instant' });
  }

  target.focus({ preventScroll: true });

  return true;
};
