# Design system

How the web app (`apps/web`) is styled, and the rules to follow when redesigning a page. First applied to the pet list (`/pets`); the other pages still use the older markup with the new tokens.

## Visual direction

Calm, trustworthy and photo-first. The interface stays quiet so pet photos carry the colour.

- **Palette:** a cool off-white page, white cards and blue-tinted near-black text. One brand colour, **blue** (`primary`, `#2368bd`; hover `#1e55a4`), used for main actions, links, selected states and focus. It reads as calm and trustworthy, and it's distinct from the error red, the amber "pending" and the green "available" status. Changed from terracotta on 2026-10-28; every pair was re-checked for AA. There is no dark theme yet.
- **Status colours** are tints with dark text of the same hue: green = available/accepted, amber = pending, red = rejected/errors, grey = adopted/withdrawn.
- **Type:** [Figtree](https://fonts.google.com/specimen/Figtree), one variable font, self-hosted through `@fontsource-variable/figtree`. No CDN request, and it works offline and in Docker. It covers Serbian Latin (č ć đ š ž). Hierarchy comes from size and weight (600 for headings), not from a second font.
- **Shape:** 8px radius for controls, 12px for cards and panels, pills only for badges. Thin cool-grey borders plus a very soft shadow. No gradients and no decorative blobs.
- **Motion:** colour/shadow transitions at 150ms, and a slight photo zoom on card hover. Everything is turned off under `prefers-reduced-motion`.

All text/background pairs meet WCAG AA (4.5:1). Input borders and the focus outline meet 3:1. Re-check contrast when you change a colour.

## Why Tailwind (and not SCSS)

The app already used Tailwind CSS 4 + shadcn/ui, with tokens as CSS custom properties. Tailwind 4 [isn't designed to be combined with Sass](https://tailwindcss.com/docs/compatibility#sass-less-and-stylus): both want to own `@import`, and Tailwind already provides what SCSS would add (variables via `@theme`, nesting, `@variant` for breakpoints, `@utility` for mixin-like helpers). Adding SCSS would create two styling systems. So this foundation builds on the existing setup, and the unused `sass` package was removed (2026-10-26).

**Style isolation.** There is no Vue-style `<style scoped>`. Isolation comes from styling with utility classes in the component's own markup: classes only affect the element they're on, so nothing leaks. Variants live next to the component with `cva` (see `button.tsx`). `cn()` (clsx + tailwind-merge) lets a caller override a class safely. Global CSS is limited to tokens, document defaults and `page-container`. If a component ever needs real custom CSS (complex animation, third-party markup), use a CSS Module next to it (for example `photo-cropper.module.css`); Vite supports them without configuration.

## Files

| File                                  | Contents                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/index.css`              | Entry: imports Tailwind, shadcn helpers, tokens and base; defines `page-container`.                                            |
| `apps/web/src/styles/tokens.css`      | All design tokens (`:root`) and their mapping to Tailwind utilities (`@theme`).                                                |
| `apps/web/src/styles/base.css`        | Document defaults: font, heading weight, global focus outline, selection colour, reduced motion.                               |
| `apps/web/src/main.tsx`               | Imports the font, then `index.css`.                                                                                            |
| `apps/web/src/components/ui/`         | Primitives: `button`, `badge`, `card`, `input`, `textarea`, `native-select`, `label`, `skeleton`, `field-control.ts` (shared form-control classes). |
| `apps/web/src/components/`            | App-level building blocks: `page-header`, `state-message`, `pagination`.                                                       |
| `apps/web/src/features/*/components/` | Feature components (`pet-card`, `pet-status-badge`…).                                                                          |

## Tokens

Defined once in `styles/tokens.css`:

1. `:root { --primary: oklch(...) }`: the raw value. It's a normal CSS variable, so it's available at runtime and inline (`style={{ color: 'var(--primary)' }}`), and a dark theme later only means redefining these.
2. `@theme inline { --color-primary: var(--primary) }`: tells Tailwind about it, which generates `bg-primary`, `text-primary`, `border-primary`, `outline-primary`, and so on.

| Group                | Tokens → utilities                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Surfaces / text      | `background`, `foreground`, `card`, `muted`, `muted-foreground`, `popover`                                               |
| Brand                | `primary`, `primary-hover`, `primary-foreground`, `secondary(-foreground)`, `accent(-foreground)`                        |
| Feedback             | `destructive`, `destructive-subtle`, `success`, `success-subtle`, `warning`, `warning-subtle`                            |
| Lines                | `border` (dividers, cards), `input` (form controls), `ring` (focus)                                                      |
| Radius               | `rounded-sm` 6px · `rounded-md` 8px (controls) · `rounded-lg` 12px (cards) · `rounded-xl` 16px · `rounded-full` (badges) |
| Shadow               | `shadow-card` (resting surfaces), `shadow-raised` (hover, floating)                                                      |
| Layout               | `max-w-page` (76rem), `page-container` (centred column + side padding)                                                   |
| Spacing / text sizes | Tailwind's default 4px scale and type scale                                                                              |

Use tokens, never raw colours (`bg-[#b64c1b]`, `text-orange-700`). To add one, add the variable in `:root`, map it in `@theme inline`, and note it in the table above.

## Primitives

- **Button**: variants `default` (one main action per area), `outline` (secondary), `secondary`, `ghost` (toolbars, header), `destructive`, `link`. Sizes: `sm` 32px (header, dense lists), `default` 40px, `lg` 44px, `icon`. Use `asChild` to style a router `Link` as a button. Put icons before the text and mark them `aria-hidden`.
- **Required fields**: `<Label required>` adds a red `*` after the label (outside the `<label>` and `aria-hidden`, so the field's name stays the label text). Also set `required` on the control. Forms with several fields start with `<RequiredFieldsNote />` ("Fields marked * are required."). Optional fields keep "(optional)" in the label.
- **Pointer cursor**: `Button` and `NativeSelect` set `cursor-pointer`; `styles/base.css` gives raw buttons, file-picker buttons, checkboxes, radios and `summary` a pointer, and never to disabled controls.
- **Input / Textarea / NativeSelect / Label**: same height, border, hover, focus and `aria-invalid` styles through `fieldControlClassName`. `NativeSelect` is a real `<select>` with a custom arrow. Its `className` styles the select and `containerClassName` styles the wrapper (width, grid span). Every control needs a label: a visible `<label>`, or `aria-label` when the context is clear (search, filters).
- **Card**: the one surface style (white, border, `rounded-lg`, `shadow-card`). Override padding/gap with `className` instead of creating a new surface.
- **Badge**: `success`, `warning`, `neutral`, `destructive` for statuses, mapped per domain in `PetStatusBadge` and `ApplicationStatusBadge`. Don't pick colours ad hoc.
- **PageHeader**: the page `<h1>`, an optional description, and the main actions. Every page starts with it.
- **StateMessage**: empty and error states (icon, title, hint, one action). `tone="error"` adds `role="alert"`.
- **Skeleton**: loading placeholders shaped like the real content. Pair them with a visually hidden `role="status"` text (see `PetsPage`).
- **Focus**: one global `:focus-visible` outline (2px `ring`, 2px offset). Don't add `outline-none` to focusable elements. The one exception is the card pattern below, where the card draws the outline instead.
- **Whole-card links**: one real link (the title), with `after:absolute after:inset-0` so it covers the card, and `has-[a:focus-visible]:outline-*` on the card. This avoids duplicate "View details" links (see `pet-card.tsx`).

## UX conventions (from the [UX benchmark](ux-benchmark.md))

- **Your pets are marked on cards:** a `secondary` "Your pet" badge (icon + text) in the photo's top-right corner, from `isPetOwner` with the cached current user (display only; nothing shows while the session loads or when signed out).
- **Photos are 4:3 everywhere** (cards, gallery, thumbnails), so a pet looks the same on the list and on its page. With several photos, show a "1 / N" counter.
- **One primary action per page, near the top.** On detail pages it sits in a panel beside the photo on desktop (sticky) and right after the photo on mobile, before long text.
- **Facts before the story:** short label/value tiles (`dl`) ahead of the description.
- **Confirm destructive or final actions in a dialog** with `ConfirmDialog` (`components/confirm-dialog.tsx`, built on Radix AlertDialog in `components/ui/alert-dialog.tsx`): a short question as the title, the consequence in words that match the real rules, Cancel and a clearly labelled confirm button (red for destructive actions). Focus starts on Cancel and returns to the trigger; Esc cancels; while the action runs both buttons are disabled and the dialog can't be closed. Errors go to the global toast. Used for deleting a pet, accepting or rejecting an application, and admin moderation. Reversible actions (withdraw) don't ask. Never use `window.confirm`.
- **Set expectations before a commitment:** explain what happens next beside a form (see `adoption-steps.tsx`), using wording that matches the real business rules.
- **Unknown answers:** profile facts can be "unknown". Cards and fact tiles leave unknown facts out (no "Unknown" noise); the "Home and lifestyle" list shows them as "Not known yet", so adopters see what still needs asking. Positive answers get a ✓ chip on cards.
- **Long forms are grouped** into `fieldset`s with a `legend` (e.g. "Basics", "Home and lifestyle"), and related selects (children/dogs/cats) share an inner `fieldset`.
- **Data lists (admin area) are rows, not tables:** a `Card` holding a `ul.divide-y`, one `li` per record with `flex-wrap`, so they reflow on phones without horizontal scrolling. Filters sit in a `role="search"` panel and live in the URL; section navigation uses `NavLink` tabs (`aria-current="page"`). Per-row actions name their target in the accessible name ("Make admin: Ana") when the visible label repeats on every row. Consequential admin actions use `ConfirmAction` (`features/admin/components/confirm-action.tsx`), a `ConfirmDialog` titled with the row's accessible name, with an optional reason field. Status badges for moderation use `destructive` ("Suspended", "Hidden").
- **Forms:** a visible label, a hint linked with `aria-describedby`, the error below the field, and a character counter when there's a limit.

## Responsive layout

Tailwind's mobile-first breakpoints: base styles are for phones, and `sm` (640px), `md` (768px), `lg` (1024px) and `xl` (1280px) add on top. No custom breakpoints. In custom CSS use `@variant sm { ... }` rather than hard-coded media queries.

- Page width: `page-container` (16 → 24 → 32px side padding). The app shell already applies it to `<main>`, so pages don't add their own `max-w-*` unless they're narrower forms (`max-w-md`, `max-w-2xl`).
- Grids: `sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` for pet cards (the page size of 12 divides evenly).
- Header: actions wrap onto a second row on narrow screens. If the navigation grows past ~4 items, replace this with a disclosure menu.
- Form controls use `text-base` below `sm`, which stops iOS from zooming into them.

## Redesigning a page: checklist

1. Start with `PageHeader`. Use `space-y-8` between page sections and `gap-6` inside grids.
2. Use `Card` for every surface, and `Input` / `NativeSelect` / `Button` for controls. Remove local class-string constants (`inputClassName`, `controlClassName`).
3. Handle all four states: loading (`Skeleton` + status text), empty and error (`StateMessage`, with retry where it helps), and success.
4. Use semantic elements (`ul`/`li` for collections, headings in order, `nav` with a label).
5. Put new text in `en` and `sr`. Don't change visible text that tests rely on without updating the tests.
6. Check at 375px and 1280px, using only the keyboard (Tab, Enter, Esc), and with reduced motion on.
7. Don't change behaviour, routes or API calls as part of a visual change.
