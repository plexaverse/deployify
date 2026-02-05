# UI Updates

## Theme Consistency

Refactored components and pages to strictly adhere to the CSS variable-based theming system (`src/app/globals.css`).

### `src/app/join/page.tsx`
- Replaced hardcoded colors (`bg-white`, `text-gray-600`, `bg-gray-50`) with theme variables:
  - `bg-white` -> `card` (component class)
  - `text-gray-600` -> `text-[var(--muted-foreground)]`
  - `bg-gray-50` -> `bg-[var(--background)]`
  - `text-red-600` -> `text-[var(--error)]`
- Updated avatar placeholder to use `bg-[var(--muted)]/20` and `text-[var(--muted-foreground)]`.

### `src/app/join/JoinButton.tsx`
- Replaced custom button styles with standard `.btn` and `.btn-primary` classes.
- Added `disabled:opacity-50` and `disabled:cursor-not-allowed` for better disabled state UX.
- Updated error message to use `bg-[var(--error-bg)]` and `text-[var(--error)]`.
- Added `w-full` to button and error container for better layout.

### `src/app/dashboard/page.tsx`
- Removed inline style `style={{ background: 'var(--card)', color: 'var(--muted)' }}`.
- Replaced with Tailwind utility classes `bg-[var(--card)] text-[var(--muted)]`.
