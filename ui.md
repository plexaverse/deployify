# UI Updates

## Theme Consistency

Refactored components and pages to strictly adhere to the CSS variable-based theming system (`src/app/globals.css`).

### `src/app/globals.css`
- Fixed Light Mode theme definition:
  - Swapped `--primary` (white -> black) and `--primary-foreground` (black -> white) in `:root` to ensure visibility and contrast on light backgrounds.
  - Updated `--gradient-primary` in `:root` to a dark gradient for light mode.
  - Added `--gradient-primary` override in `.dark` to maintain the white gradient for dark mode.

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

### `src/components/DashboardHome.tsx`
- Replaced hardcoded colors with theme variables:
  - `text-neutral-500` -> `text-[var(--muted-foreground)]`
  - `bg-white/5` -> `bg-[var(--card)]`
  - `border-white/10` -> `border-[var(--border)]`
- Updated "New Project" and "Create Project" buttons to use `.btn` and `.btn-primary` classes.
- Standardized typography colors using `text-[var(--foreground)]` and `text-[var(--muted-foreground)]`.

### `src/components/ProjectCard.tsx`
- Updated `statusConfig` to use semantic theme variables (`--success`, `--warning`, `--error`, `--info`, `--muted-foreground`) instead of hardcoded Tailwind colors.
- Replaced hardcoded deployment info background `bg-white/5` with `bg-[var(--card)]`.
- Replaced border colors with `border-[var(--border)]`.

### `src/app/login/page.tsx`
- Updated page background to `bg-[var(--background)]` to support light/dark modes.
- Updated `Spotlight` fill to `var(--foreground)` for visibility in both themes.
- Replaced hardcoded gradient text with `gradient-text` class.
- Updated "Continue with GitHub" button to use `.btn` and `.btn-primary` classes.
- Updated divider background and text colors to use `border-[var(--border)]` and `bg-[var(--card)]`.

### `src/app/settings/team/page.tsx`
- Created new Team Settings page with the following sections:
  - **Invite New Member**: Card with email input and role selector, using `.card`, `.input`, and `.btn-primary` classes.
  - **Team Members**: List of members with avatar, name, email, and role selector. Uses `.card` and `divide-y`.
  - **Audit Log**: Mocked activity feed with timeline styling using `border-l` and relative positioning.
- Integrated into global layout via `src/app/settings/layout.tsx` which reuses `DashboardSidebar`.
- Used `lucide-react` icons for consistent UI.
- Implemented role updates using `<select>` with custom styling to match the theme.

## Mobile-First Monitoring Pass (Session 61)

Audited and optimized UI for mobile responsiveness and performance.

### `src/components/DashboardSidebar.tsx`
- Added `z-50` to mobile overlay and sidebar container for proper layering.
- Added `backdrop-blur-sm` to mobile overlay.
- Added `shadow-xl` to sidebar in mobile view.
- Increased navigation link padding (`py-3` on mobile) for better touch targets.
- Added auto-close behavior when clicking a link on mobile.

### `src/components/ui/background-beams.tsx` & `src/components/ui/spotlight.tsx`
- Added `hidden md:block` utility class to disable these resource-intensive animations on mobile viewports (< 768px).

### `src/app/dashboard/[id]/page.tsx`
- Refactored Deployment History list items to use `flex-col md:flex-row` layout.
- Stacked deployment metadata and actions vertically on mobile for better readability.
- Aligned action buttons and status badges to the left on mobile (`items-start`) and right on desktop (`md:items-end`).

### `src/components/analytics/AnalyticsCharts.tsx`
- Added `min-h-[300px]` to chart container to prevent layout collapse on small screens.

### `src/components/RollbackModal.tsx`
- Added `max-h-[85vh]` to modal container to fit within mobile viewports.
- Added `overflow-y-auto` to content area to support scrolling in landscape mode or small screens.
- Added `shrink-0` to header and footer to prevent them from collapsing.
