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
- Replaced the basic "No projects yet" empty state with the new `<OnboardingGuide />` component.
- Updated "Add New" button link to point to the improved wizard at `/new` instead of `/dashboard/new`.

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

### `src/components/LogViewer.tsx`
- Rebuilt component with "Professional Log Viewer" features:
  - Added tabbed navigation for **Runtime Logs**, **System Logs**, and **Build Logs**.
  - Implemented toolbar with:
    - Text search input with clear button.
    - Severity filter toggles (INFO, WARNING, ERROR).
    - "Follow" (Pause/Resume) toggle.
    - "Clear" logs action.
  - Standardized log display using `font-mono text-[12px] leading-relaxed` (JetBrains Mono).
  - Integrated `Skeleton` component for loading states.
  - Implemented client-side filtering for immediate feedback.

### `src/app/new/page.tsx`
- Created a new full-screen Project Creation Wizard with a 3-step flow (Select, Configure, Deploy).
- Uses `BackgroundBeams` for a premium background effect.
- Implemented a custom Stepper UI with `StepIndicator` component.
- **Step 1 (Select)**: Searchable repository list with `.card`-like styling using `bg-white/5` and `border-white/10` for glassmorphism effect.
- **Step 2 (Configure)**: Form for project settings and environment variables using consistent input styling (`bg-black/40`, `border-white/10`).
- **Step 3 (Deploy)**: Real-time terminal log console with `bg-black/80` and monospaced font, including status indicators and auto-scrolling.
- Uses `sonner` for toast notifications throughout the flow.
- Uses `lucide-react` icons for consistent visual language.

## Phase 2: Micro-interactions & Final Polish

### `src/app/layout.tsx`
- Implemented global page transitions by wrapping the root layout content with `<PageTransition>`.

### `src/app/dashboard/layout.tsx`
- Removed `<PageTransition>` wrapper to avoid nested transitions and ensure a consistent experience across the app.

### `src/app/settings/team/page.tsx`
- Replaced the simple pulse loading state with a standardized `<Skeleton>` layout for better visual feedback.
- Upgraded the "Send Invite" button to use the `MovingBorder` `Button` component for high-priority action emphasis.

### `src/app/dashboard/new/import/page.tsx`
- Upgraded the "Deploy" button to use the `MovingBorder` `Button` component.

### `src/app/dashboard/[id]/page.tsx`
- Upgraded the "Rollback" button (in deployment history) to use the `MovingBorder` `Button` component.
- Added a "Copy to Clipboard" button for the Git Commit SHA in the deployment history list, including a success checkmark state.

### Components
- **MovingBorder Button**: Utilized `containerClassName` to control dimensions while maintaining the Aceternity UI effect.
- **Skeleton**: Applied for content loading states.

## Progressive UI & Theme Consistency Refactor (Session 63)

Conducted a comprehensive pass to eliminate remaining hardcoded colors and standardize UI components across the application.

### `src/app/globals.css`
- Defined semantic terminal theme variables to ensure consistency across all log viewing interfaces:
  - `--terminal-bg`: Dark background for terminal-like components.
  - `--terminal-foreground`: High-contrast text for terminal logs.
  - `--terminal-border`: Subtle border for terminal containers.
  - `--terminal-header-bg`: Slightly lighter background for terminal tab bars/headers.
- Updated `.log-viewer` class to use these variables.

### `src/app/new/page.tsx` (Project Creation Wizard)
- Replaced all raw `<select>` elements with the standardized `NativeSelect` component for consistent form styling.
- **Step 3 (Deploy)**: Refactored the live terminal log viewer:
  - Replaced hardcoded `bg-neutral-950` and `bg-white/5` with semantic terminal variables.
  - Replaced hardcoded status dot colors (red, amber, emerald) with theme-aware status variables (`--error`, `--warning`, `--success`).
  - Improved contrast of terminal text by using `--terminal-foreground`.

### `src/app/dashboard/[id]/realtime/page.tsx`
- Refactored to use the `Card` component with `p-0` and `overflow-hidden` to match the standard project logs layout.
- Standardized typography and spacing to align with the rest of the project dashboard.

### `src/components/Header.tsx`
- Enhanced breadcrumb logic to automatically resolve and display the project name instead of a UUID when a project is active in the global store. This significantly improves readability for project-specific pages.

### `src/app/dashboard/[id]/page.tsx` (Project Overview)
- Standardized status indicators:
  - Replaced hardcoded `text-emerald-500` and `bg-emerald-500` with `var(--success)`.
  - Replaced hardcoded `text-red-500` with `var(--error)`.
- Updated "Rollback" and "Cancel" buttons to use standard semantic colors and theme-aware hover states (`var(--error-bg)`).

### `src/components/analytics/RealtimeVisitors.tsx`
- Standardized live status indicators to use `var(--success)` instead of hardcoded emerald shades.

### `src/app/join/` (Team Invitation Flow)
- **`page.tsx`**: Replaced manual `card` classes with the `Card` component for better layout consistency and shadow management.
- **`JoinButton.tsx`**: Replaced the manual `.btn .btn-primary` classes with the `Button` component, utilizing its built-in `loading` state for better UX.

### `src/components/BuildLogViewer.tsx`
- Fully refactored to use semantic terminal theme variables for background, foreground, and loading skeletons.
- Replaced hardcoded dark mode colors (`bg-[#0d1117]`) with theme variables to support future theme variations.

### `src/components/LandingPage.tsx`
- Removed remaining hardcoded colors:
  - Rocket icon and "Deployify" logo now use `var(--foreground)` and `var(--muted-foreground)`.
  - "Sign In" link uses theme-aware colors for better visibility in both modes.
  - **Back to Top** button: Replaced manual white/glass styles with the `Card` component styling and theme-aware hover effects.

## Onboarding & Empty States

### `src/components/OnboardingGuide.tsx`
- Created a new component for the dashboard empty state.
- Features `BackgroundBeams` for a visual "hero" section feel.
- Visualizes the onboarding steps: Connect GitHub -> Import Project -> Configure -> Deploy.
- Provides a prominent "Import Project" call-to-action using the `MovingBorder` `Button`.
- Uses `framer-motion` for entrance animations.
- Links to the improved Project Creation Wizard at `/new`.

## Component System & Settings Refactor

Established a robust UI component system and refactored key pages to use it.

### UI Primitives (`src/components/ui/`)
- Created standardized components to replace utility classes and inline styles:
  - **`Card`**: Standardized container with border, background, and shadow.
  - **`Input`**: Standardized text input field with focus states and theming.
  - **`Button`**: Reusable button component with variants (primary, secondary, ghost, etc.) and loading state.
  - **`Label`**: Standardized form label.
  - **`ConfirmationModal`**: Reusable modal for destructive actions.
- Updated **`MovingBorderButton`** to use CSS variables for better theme compatibility (light/dark mode).

### `src/app/dashboard/[id]/settings/page.tsx`
- Refactored entire page to use new UI primitives (`Card`, `Input`, `Label`, `Button`).
- Replaced custom `Loader2` loading states with `Skeleton`.
- Implemented `ConfirmationModal` for the "Delete Project" action, providing a safer and better UX.
- Improved layout spacing and typography.

### Settings Components
Refactored all project settings components to use the new UI system:
- **`DomainsSection`**: Updated to use `Card`, `Button`, `Input`. Added `Skeleton` loading state.
- **`EnvVariablesSection`**: Updated layout and inputs.
- **`RegionSettings`**: Standardized region selection with `Card` and styled select.
- **`ResourceSettings`**: Updated sliders/inputs to use standard components.
- **`BranchDeploymentsSettings`**: Updated branch management UI.

### `src/app/billing/page.tsx`
- Refactored page structure to use `Card` and standard typography.
- Extracted `UsageGauge` into a reusable component (`src/components/billing/UsageGauge.tsx`) with updated styling.
- Updated **`PricingCard`** and **`ComparePlansTable`** to use `Card`, `Button`, and `Badge` components.
- Ensured all colors are derived from CSS variables for consistent theming.

## Dashboard & Analytics Refactor

Refactored deployment and analytics pages to use standard UI components and theme variables.

### `src/components/ui/badge.tsx`
- Added `success`, `warning`, `info` variants to support semantic status colors using CSS variables.

### `src/app/dashboard/[id]/deployments/page.tsx`
- Replaced `div` elements with `Card` component.
- Replaced manual status indicators with `Badge` component using new variants.
- Replaced `btn btn-ghost` with `Button` component.
- Updated text colors to use theme variables (`text-[var(--muted-foreground)]`).

### `src/app/dashboard/[id]/analytics/page.tsx`
- Wrapped content sections in `Card` components.
- Standardized empty state with `Card`.
- Ensured consistent text colors.

### `src/components/analytics/AnalyticsCharts.tsx`
- Refactored `WebVitalCard` and `SummaryCard` to use `Card`.
- Replaced hardcoded colors with CSS variables (e.g., `text-[var(--success)]`).
- Wrapped charts in `Card`.

### `src/app/dashboard/[id]/logs/page.tsx`
- Wrapped `LogViewer` in `Card`.

### `src/components/LogViewer.tsx`
- Updated styling to use theme variables for severity filters and status indicators.
- Ensured consistent border and background usage.

## Dashboard & Team Settings Refactor

Refactored the main dashboard and team settings pages to use the standardized UI component system and CSS variables.

### `src/components/ui/button.tsx`
- Refactored `buttonVariants` to use explicit CSS variable classes (e.g., `bg-[var(--primary)]`) instead of relying on Tailwind utility classes that might be missing the variable mapping.
- Ensured consistent theming across all button variants (`primary`, `secondary`, `outline`, `ghost`).

### `src/app/dashboard/page.tsx`
- Replaced the search `<input>` with the `Input` component.
- Replaced manual card divs with the `Card` component.
- Replaced manual badge spans with the `Badge` component.
- Updated the "Add New" button to use `buttonVariants`.
- Replaced the "Clear search" button with the `Button` component.

### `src/app/settings/team/page.tsx`
- Replaced manual card containers with the `Card` component.
- Replaced manual input fields with the `Input` component.
- Replaced manual badges with the `Badge` component.
- Standardized action buttons (Remove Member, Revoke Invite) to use the `Button` component with `ghost` variant.
- Aliased the `MovingBorder` `Button` as `MovingBorderButton` to coexist with the standard `Button`.

### `src/components/DashboardHome.tsx`
- Updated to use `OnboardingGuide` for the empty state instead of a manual implementation.
- Updated links to point to `/new` instead of `/dashboard/new`.
- Updated to use `buttonVariants` for consistent button styling.
- Updated `BentoGrid` and `BentoGridItem` usage to align with the new theme variables.

### `src/components/ui/bento-grid.tsx`
- Updated styles to use `bg-[var(--card)]`, `border-[var(--border)]`, and text variables instead of hardcoded `bg-white/5`.

### `src/components/CommandPalette.tsx`
- Updated styles to use theme variables (`bg-[var(--card)]`, `border-[var(--border)]`) for the modal and input.

## Authentication & Onboarding Refactor

Refactored the Login and New Project Wizard pages to ensure full theme compatibility and use standard UI components.

### `src/app/new/page.tsx` (New Project Wizard)
- Replaced hardcoded dark mode colors (`bg-black`, `text-white`, `bg-white/5`) with CSS variables (`bg-[var(--background)]`, `text-[var(--foreground)]`, `bg-[var(--card)]`).
- **Step 1 (Select)**:
  - Replaced `<input>` search with `Input` component.
  - Replaced repo list items with `Card` components.
- **Step 2 (Configure)**:
  - Wrapped settings and environment variables sections in `Card` components.
  - Replaced all `<input>` elements with `Input` component.
  - Styled `<select>` elements to match `Input` styling using `cn` utility.
  - Replaced "Deploy" and action buttons with `Button` component.
- **Step 3 (Deploy)**:
  - Updated status indicators to use theme colors (`--success`, `--error`, `--info`).
  - Preserved the dark terminal look for the logs while ensuring layout consistency.

### `src/app/login/page.tsx`
- Replaced the custom `card-glass` div with the `Card` component, adding `backdrop-blur-xl`.
- Replaced the "Continue with GitHub" link styling with `buttonVariants({ variant: 'primary', size: 'lg' })`.
- Ensured all text colors use `text-[var(--foreground)]` or `text-[var(--muted-foreground)]`.

## Project Dashboard & Import Refactor

Refactored the specific project dashboard and the fallback import page to use standard UI components.

### `src/app/dashboard/[id]/page.tsx`
- Replaced manual `div` cards with the `Card` component.
- Replaced manual `btn` classes with the `Button` component.
- Replaced manual status badges with the `Badge` component.
- Ensured consistent usage of theme variables for colors.
- Improved robustness of `WebVitals` component against partial data.

### `src/components/ui/native-select.tsx`
- Created a new `NativeSelect` component that mirrors the styling of the `Input` component but for `<select>` elements.
- Provides a consistent look for native dropdowns without requiring complex third-party libraries.

### `src/app/dashboard/new/import/page.tsx`
- Replaced manual `div` cards with the `Card` component.
- Replaced manual `className="input ..."` inputs with the `Input` component.
- Replaced manual `select` elements with the new `NativeSelect` component.
- Replaced manual labels with the `Label` component.
- Replaced manual buttons with the `Button` component.

## Portal & Modals Refactor

Implemented proper portal-based modal rendering and refactored modals to use the UI component system.

### `src/components/ui/portal.tsx`
- Created a `Portal` component to render content into `document.body` for better z-index management and stacking context isolation.

### `src/components/CreateTeamModal.tsx`
- Wrapped modal content in `<Portal>`.
- Replaced custom backdrop and container styles with `Portal` and `Card`.
- Replaced native inputs and buttons with `Input`, `Label`, and `Button` components.
- Added `size="icon"` support to `Button` component to handle the close button correctly.

### `src/components/RollbackModal.tsx`
- Wrapped modal content in `<Portal>`.
- Replaced internal elements with `Card`, `Button` and standard typography.
- Updated colors to use theme variables (`bg-[var(--background)]`, `text-[var(--foreground)]`).

### `src/components/DeploymentLogsModal.tsx`
- Wrapped modal content in `<Portal>`.
- Replaced header and layout with `Card`, `Button`, and `Badge`.
- Fixed `Badge` variant usage (mapped `error` status to `destructive` variant).

## Edge Debug & Landing Page Refactor

### `src/app/edge-debug/page.tsx`
- Completely refactored the page to use `Card`, `Button`, `Input`, `NativeSelect`, and `Label`.
- Replaced hardcoded colors with theme variables (`text-[var(--foreground)]`, `bg-[var(--card)]`).
- Maintained functionality while improving visual consistency.

### `src/components/LandingPage.tsx`
- Updated color usage to rely on CSS variables (`var(--background)`, `var(--foreground)`, `var(--muted-foreground)`) instead of hardcoded dark mode values.
- This ensures better compatibility with potential light mode or theme adjustments while preserving the intended aesthetic.

### `src/components/BuildLogViewer.tsx`
- Refactored to use `Skeleton` for loading states.
- Updated error and empty states to use `Button` and theme colors.
- Preserved the dark terminal aesthetic for the logs themselves but cleaned up the surrounding UI.

### `src/components/DeploymentTimeline.tsx`
- Refactored to use theme variables for colors (`--primary`, `--success`, `--error`).
- Improved code readability and standard class usage (`cn` utility).

### `src/components/ui/button.tsx`
- Added `size="icon"` variant to support square icon-only buttons.
