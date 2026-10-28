import { afterEach, describe, expect, it, vi } from 'vitest';

import { focusFirstInvalidField } from './focus-first-invalid-field';

const renderForm = (html: string): HTMLFormElement => {
  const form = document.createElement('form');
  form.innerHTML = html;
  document.body.append(form);
  return form;
};

/** Gives an element a position relative to the viewport (jsdom has no layout). */
const placeAt = (element: Element, top: number, height = 40) => {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    top,
    bottom: top + height,
  } as DOMRect);
};

// jsdom does not implement scrollIntoView.
const mockScrollIntoView = () => {
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  return scrollIntoView;
};

describe('focusFirstInvalidField', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it('focuses the first invalid control in page order', () => {
    const form = renderForm(`
      <input id="a" />
      <textarea id="b" aria-invalid="true"></textarea>
      <input id="c" aria-invalid="true" />
    `);

    expect(focusFirstInvalidField(form)).toBe(true);
    expect(document.activeElement?.id).toBe('b');
  });

  it('skips disabled and hidden controls', () => {
    const form = renderForm(`
      <input id="disabled" aria-invalid="true" disabled />
      <div hidden><input id="hidden-attr" aria-invalid="true" /></div>
      <div style="display: none"><input id="display-none" aria-invalid="true" /></div>
      <input id="invisible" aria-invalid="true" style="visibility: hidden" />
      <input id="visible" aria-invalid="true" />
    `);

    focusFirstInvalidField(form);

    expect(document.activeElement?.id).toBe('visible');
  });

  it('does nothing when no control is invalid', () => {
    const form = renderForm(
      '<input id="a" aria-invalid="false" /><input id="b" />',
    );

    expect(focusFirstInvalidField(form)).toBe(false);
    expect(focusFirstInvalidField(null)).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });

  it('does not scroll when the control is already fully visible', () => {
    const scrollIntoView = mockScrollIntoView();
    const form = renderForm('<input id="a" aria-invalid="true" />');
    placeAt(form.querySelector('#a')!, 100);

    focusFirstInvalidField(form);

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(document.activeElement?.id).toBe('a');
  });

  it.each([
    ['above the viewport', -200],
    ['below the viewport', window.innerHeight + 100],
    ['partly cut off at the bottom', window.innerHeight - 10],
  ])('centres a control %s, without smooth scrolling', (_case, top) => {
    const scrollIntoView = mockScrollIntoView();
    const form = renderForm('<input id="a" aria-invalid="true" />');
    const input = form.querySelector<HTMLInputElement>('#a')!;
    placeAt(input, top);
    const focus = vi.spyOn(input, 'focus');

    focusFirstInvalidField(form);

    expect(scrollIntoView).toHaveBeenCalledWith({
      block: 'center',
      behavior: 'instant',
    });
    // Already scrolled: focusing must not scroll again.
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });
});
