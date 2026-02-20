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

## Multi-Framework Support Expansion

Expanded the platform's framework support to include Nuxt and SvelteKit, ensuring consistent detection and deployment workflows.

### `src/lib/github.ts`
- Updated `detectFramework` to support **Nuxt** and **SvelteKit** by detecting their configuration files and dependencies.
- Added basic **Bun** detection support via `bun.lockb`.

### `src/lib/dockerfiles.ts`
- Implemented `generateNuxtDockerfile` targeting the Nitro standalone output (`.output/server/index.mjs`).
- Implemented `generateSvelteKitDockerfile` targeting the node-adapter output (`build/index.js`).

### `src/lib/github/validator.ts`
- Added strict validation checks for Nuxt and SvelteKit projects to ensure required configuration files are present before deployment.

### `src/app/api/projects/route.ts`
- Updated the project creation flow to automatically set correct default output directories for Nuxt (`.output`) and SvelteKit (`build`).

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

## Global Components & Analytics Refactor

Refactored global components to use the new `Avatar` primitive and theme variables, and standardized analytics alerts.

### `src/components/ui/avatar.tsx`
- Created a new `Avatar` component with `AvatarImage` and `AvatarFallback` subcomponents.
- Handles image loading errors gracefully and displays fallback content.
- Styled using theme variables for consistency.

### `src/components/DashboardSidebar.tsx`
- Replaced native `<img>` elements with the `Avatar` component.
- Replaced hardcoded overlay background `bg-black/50` with `bg-background/80` for better theming support.
- Improved the User/Footer section layout.

### `src/components/TeamSwitcher.tsx`
- Replaced native `<img>` elements with the `Avatar` component.
- Replaced hardcoded `bg-blue-500` colors with theme-aware `var(--info)` and `var(--info-bg)`.
- Replaced hardcoded `bg-primary/10` with proper theme variables.

### `src/components/analytics/AnalyticsAlerts.tsx`
- Replaced hardcoded status colors (`amber-500`, `rose-500`) with semantic theme variables (`--warning`, `--error`).
- Utilized `cn` utility for class merging.

### Modals (`CreateTeamModal`, `RollbackModal`, `DeploymentLogsModal`)
- Updated all modals to use `bg-background/80` with backdrop blur for the overlay, ensuring consistent appearance in light/dark modes.
- **`DeploymentLogsModal`**: Replaced hardcoded dark background `bg-[#0d1117]` with `var(--terminal-bg)` to match `BuildLogViewer`.

## Theme Consistency & Standard UI Refactor (Session 65)

Conducted a final comprehensive pass to eliminate remaining hardcoded styles and consolidate the UI using standard components.

### `src/components/ProjectAvatar.tsx`
- Refactored to use the `Avatar` component primitives (`Avatar`, `AvatarImage`, `AvatarFallback`).
- Replaced hardcoded Tailwind background colors with a consistent set of theme-aware status colors (`--info`, `--success`, `--warning`, `--error`, `--primary`, `--muted-foreground`).

### `src/app/dashboard/settings/page.tsx` (Team Settings)
- Replaced custom `Loader2` pulse state with a standardized `<Skeleton>` layout.
- Replaced all manual `<select>` elements with the `NativeSelect` component.
- Replaced native `<img>` elements with the `Avatar` component.
- Standardized the "Danger Zone" section with theme-aware background colors and explicit `Button` variants.

## Standardized Confirmations & UI Polishing (Session 71)

Conducted a pass to replace native browser dialogs with themed components and improve UI consistency.

### `src/components/EnvVariablesSection.tsx`, `src/components/DomainsSection.tsx`, `src/components/CronsSection.tsx`
- Replaced native `confirm()` dialogs with the `ConfirmationModal` component for all delete actions.
- This ensures a consistent look and feel and better user experience across the project settings.

### `src/components/EnvVariablesSection.tsx`
- Replaced native checkboxes with the `Switch` component.
- Refactored radio button groups (Target Environment Type and Scope) to use themed pill-style buttons for a more modern and consistent UI.
- Improved layout and spacing of the environment variable creation form.

### `src/components/BranchDeploymentsSettings.tsx`
- Replaced the manual empty state with the `EmptyState` component for better visual consistency.

### `src/app/dashboard/new/import/page.tsx`
- Replaced native checkbox for environment variable secrets with the `Switch` component to match the rest of the application.

### `src/app/settings/team/page.tsx`
- Replaced native `select` elements with the `NativeSelect` component.
- Replaced raw `img` elements with the `Avatar` component.
- Replaced manual `confirm()` dialogs with the `ConfirmationModal` component for member removal and invitation revocation.

### `src/app/dashboard/[id]/settings/page.tsx` (Project Settings)
- Replaced the framework selection `<select>` with the `NativeSelect` component.
- Updated checkboxes to use `var(--primary)` and standardized border colors.
- Improved hover states and layout consistency for settings cards.

### `src/components/GlobalShortcuts.tsx`
- Wrapped the shortcuts modal in the `Portal` component for proper layering.
- Replaced manual backdrop and container styles with `bg-background/80 backdrop-blur-sm` and the `Card` component.
- Replaced manual close button with the `Button` component using the `ghost` variant and `icon` size.
- Updated link for project creation to point to the new wizard at `/new`.

### `src/components/analytics/DeploymentMetricsCharts.tsx`
- Wrapped chart sections in the `Card` component to align with the rest of the analytics dashboard.
- Standardized the custom tooltip with theme-aware borders and background, eliminating hardcoded shadow/ring classes.
- Standardized the empty state using the `Card` component.

### `src/components/ProjectNav.tsx`
- Refactored the active tab indicator to use `border-[var(--primary)]`, ensuring high visibility and consistency with other navigation elements.

### `src/components/ui/PlanBadge.tsx`
- Updated the plan-specific gradients to use theme-aware semantic variables (`--info`, `--success`, `--warning`, `--error`) instead of hardcoded Tailwind color shades.

## Progressive UI & Theme Consistency Refactor (Session 66)

Conducted another comprehensive pass to finalize theme consistency across the application, focusing on the compare deployments page, billing pages, and landing page.

### `src/app/globals.css`
- Expanded the semantic theme variables to include standard UI elements:
  - Added `--secondary`, `--secondary-foreground` for secondary actions and backgrounds.
  - Added `--destructive`, `--destructive-foreground` for dangerous/destructive actions.
  - Added `--popover`, `--popover-foreground` for tooltips and popover containers.
- Updated both light and dark mode definitions to ensure contrast and consistency.

### `src/components/ui/button.tsx`
- Added a `destructive` variant that uses the new `--destructive` and `--destructive-foreground` variables.
- Standardized hover states and shadows for consistency with other button variants.

### `src/components/ui/badge.tsx`
- Fully refactored to use semantic CSS variables (`var(...)`) for all variants instead of relying on standard Tailwind color classes.
- This ensures that all badges automatically adapt to theme changes and custom color definitions in `globals.css`.

### `src/app/dashboard/[id]/deployments/compare/page.tsx`
- Completely refactored the comparison page:
  - Replaced all raw `<select>` elements with the standardized `NativeSelect` component.
  - Replaced manual `<button>` elements with the `Button` component, including the back button using `variant="ghost"` and `size="icon"`.
  - Eliminated hardcoded status colors (`text-emerald-500`, `text-red-500`) and replaced them with semantic variables (`var(--success)`, `var(--error)`, `var(--warning)`).
  - Improved layout consistency by using standard `Card` padding and spacing.

### `src/app/billing/page.tsx`
- Standardized the billing dashboard:
  - Replaced manual background and text colors with theme variables.
  - Updated `UsageGauge` icons to use semantic variables for colors.
  - Refactored the current plan badge to use the standard `Badge` component with `variant="default"`.
  - Refactored the invoice history table:
    - Updated status badges to use semantic variants (`success`, `warning`, `secondary`) based on invoice status.
    - Replaced raw download links with the `Button` component (ghost variant) for better touch targets and visual consistency.

### `src/components/billing/UsageGauge.tsx`
- Refactored the SVG progress ring to use `--primary`, `--error`, and `--border` variables for its stroke colors.
- Removed hardcoded hex values and opacity classes in favor of semantic theming.

### `src/components/billing/PricingCard.tsx`
- Updated the "Most Popular" tag to use the `Badge` component with the `info` variant.
- Ensured all borders and backgrounds are derived from the theme variables.

### `src/components/billing/ComparePlansTable.tsx`
- Refactored the comparison table to ensure full theme compatibility:
  - Updated the "Current" plan badge to use the standard `Badge` component.
  - Updated the feature info tooltips to use the new `--popover` and `--popover-foreground` variables.
  - Standardized row hover states and sticky column backgrounds.

### `src/components/LandingPage.tsx`
- Final polish for theme consistency on the public landing page:
  - Replaced raw "Get Started" and "Watch Demo" buttons with the `Button` component and `buttonVariants` for consistent styling.
  - Replaced the manual "Save 80%" tag with the `Badge` component.
  - Ensured all text and background colors are fully mapped to semantic CSS variables.

## Multi-Framework & Performance Optimization (Session 67)

Expanded framework support and optimized build performance with intelligent caching.

### Framework Support Expansion
- **Bun Support**:
  - Implemented `generateBunDockerfile` using the `oven/bun` base image.
  - Added Bun detection and automatic output directory selection (`dist`).
  - Integrated Bun into all framework selection UI components (`/new`, Project Settings, Import).
- **Nuxt & SvelteKit Integration**:
  - Fully integrated Nuxt and SvelteKit into the framework selection UI and automated build pipelines.

### Build Caching Optimization
- **Dynamic Caching**:
  - Refactored `src/lib/gcp/cloudbuild.ts` to support framework-specific cache paths:
    - Next.js: `.next/cache`
    - Nuxt: `.nuxt/cache`
    - Astro: `.astro`
    - Vite: `node_modules/.vite`
    - SvelteKit: `.svelte-kit`
    - Bun: `node_modules/.cache`
  - Standardized the cache export/import process by using a consistent internal mapping.
- **Dockerfile Cache Restoration**:
  - Updated all framework-specific Dockerfile generators in `src/lib/dockerfiles.ts` to explicitly restore cached artifacts from the persistent GCS storage before the build phase.

### Security & UX Improvements
- **Secret Management**:
  - Enhanced `getEnvVarsForDeployment` in `src/lib/db.ts` to automatically decrypt secret environment variables before they are passed to the build pipeline, ensuring secure and reliable deployments.
- **Join Flow Refactor**:
  - Updated `src/app/join/page.tsx` to use the standardized `Avatar` component, ensuring theme consistency and graceful fallback behavior for team invitations.

## Error & 404 Pages

Implemented comprehensive error handling and "Not Found" pages with consistent UI theming.

### `src/app/not-found.tsx`
- Created a global 404 page featuring `BackgroundBeams` for visual appeal.
- Uses `Card` and `Button` components with theme variables.
- Provides a clear path back to the home page.

### `src/app/error.tsx`
- Created a global error boundary to catch client-side errors.
- Displays a user-friendly message and a "Try again" button.
- Logs errors to the console.

### `src/app/dashboard/not-found.tsx`
- Created a dashboard-specific 404 page that respects the sidebar layout.
- Uses `Card` and `Button` (outline variant) to fit within the dashboard context.

### `src/app/dashboard/error.tsx`
- Created a dashboard-specific error boundary.
- Allows users to retry loading the dashboard view without reloading the entire application.

### `src/app/global-error.tsx`
- Created a root-level error boundary to catch errors in the root layout.
- Replaces the entire HTML structure with a safe, themed error page.

## Progressive UI & Developer Experience (Session 68)

Conducted a targeted pass to improve theme consistency in developer-focused areas and enhance the project overview.

### `src/components/LogViewer.tsx`
- **Standardized Terminal Theme**: Replaced hardcoded `bg-[#0d1117]` and `bg-white/5` with semantic variables (`var(--terminal-bg)`, `var(--terminal-foreground)`).
- **Improved Visibility**: Updated loading skeletons and row hover states to use theme-aware colors based on `--terminal-foreground`.
- **New Feature: Copy Logs**: Added a "Copy Logs" button to the toolbar that extracts the current filtered view of logs with timestamps and severity levels formatted for sharing.
- **Icon Integration**: Added `Copy` and `Check` icons from `lucide-react` for the new copy functionality.

### `src/app/dashboard/[id]/deployments/page.tsx`
- **Hardcoded Color Removal**: Eliminated remaining Tailwind-specific color classes (`text-emerald-500`, `text-red-500`, etc.).
- **Theme-Aware Status**: Updated commit SHA copy indicator and status badges to use semantic variables (`var(--success)`, `var(--error)`).
- **Standardized Actions**: Refactored "Rollback" and "Cancel" buttons to use `var(--error)` and `var(--error-bg)` for consistent visual cues across themes.

### `src/app/dashboard/[id]/page.tsx` (Project Overview)
- **Production Card Upgrade**: Refactored the "Production Deployment" card with `shadow-lg` and a subtle themed header background (`bg-[var(--muted)]/5`).
- **Standardized Status**: Replaced manual "Live" indicator with the `Badge` component (success variant) and improved its animation.
- **Layout Refinement**: Increased padding and improved typography for the production URL and branch info.
- **Button Standardization**: Updated the URL copy button and deployment action buttons to use the UI component system (`Button` component with `icon` and `ghost` variants).

### `src/components/CommandPalette.tsx`
- **Backdrop Standardization**: Updated the modal backdrop from hardcoded `bg-black/80` to `bg-background/80 backdrop-blur-sm`, ensuring it matches the appearance of other system modals and overlays.

## Progressive UI & Primitive Refinement (Session 69)

Established new UI primitives and refactored core components to improve consistency and accessibility.

### UI Primitives (`src/components/ui/`)
- **`Switch`**: Created a new accessible toggle component for boolean settings, featuring theme-aware colors and smooth transitions.
- **`Separator`**: Created a horizontal divider component for visual grouping and hierarchy management.
- **`ConfirmationModal`**:
    - Wrapped the entire modal in the `Portal` component for reliable stacking context.
    - Replaced custom buttons and native elements with the `Button` primitive.
    - Standardized the overlay with `bg-background/80 backdrop-blur-sm` for consistent depth across all system modals.

### Settings & Configuration
- **Project Settings (`src/app/dashboard/[id]/settings/page.tsx`)**:
    - Replaced native checkboxes with the new `Switch` component for a more premium look and feel.
    - Integrated `Separator` components to clearly define sections within settings cards.
- **Team Settings (`src/app/dashboard/settings/page.tsx`)**:
    - Added `Separator` components to improve visual structure in the Invite and Danger Zone sections.
- **`BranchDeploymentsSettings`**, **`RegionSettings`**, **`ResourceSettings`**:
    - Replaced remaining raw `<select>` elements with the `NativeSelect` component.
    - Standardized layout spacing and padding to align with the rest of the application.

### Developer Experience
- **Edge Function Simulator (`src/app/edge-debug/page.tsx`)**:
    - Refactored the code editor and simulation logs to use semantic terminal theme variables (`var(--terminal-bg)`, `var(--terminal-foreground)`).
    - Replaced the manual `btn-primary` class with the `Button` component, ensuring consistent primary action styling.
    - Improved the simulation result card with better border and background contrast.

## Progressive UI & Consistency Refactor (Session 70)

Conducted a targeted pass to standardize UI components and improve visual hierarchy across key dashboard pages.

### `src/app/dashboard/[id]/page.tsx` (Project Overview)
- **Standardized Skeletons**: Replaced manual `card` classes in the loading state with the `Card` component and `Skeleton` primitives, ensuring layout consistency during data fetching.
- **Iconography Alignment**: Updated `getStatusIcon` to use `AlertCircle` for error states, aligning with the `destructive` variant of the `Badge` component for better semantic consistency.
- **Production Card Polish**: Ensured the "Live" indicator uses the `success` variant of the `Badge` component.

### `src/app/billing/page.tsx` (Billing)
- **Table Standardization**: Refactored the invoice history table header to use `bg-[var(--muted)]/5`, `text-xs`, and `uppercase tracking-wider` for a more professional, "dashboard-native" feel.
- **Button Consistency**: Updated the "Download" link to use the `Button` component with `variant="ghost"` and standardized icon sizing (`w-3.5 h-3.5`).
- **Improved Contrast**: Adjusted text colors in the invoice table to use `text-[var(--muted-foreground)]` with hover states for better readability.

### `src/app/dashboard/settings/page.tsx` (Team Settings)
- **Action Standardization**: Replaced manual background colors in the "Delete Team" button with the standard `destructive` variant of the `Button` component.
- **Badge Hierarchy**: Updated member role badges to use semantic variants:
    - **Owner**: `success` (Green)
    - **Admin**: `info` (Blue)
    - **Member/Viewer**: `secondary` (Gray)
- **Invite UI Polish**: Standardized pending invite badges to use a compact `info` variant with `uppercase` styling to match the project dashboard.
