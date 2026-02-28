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
- Replaced the manual search clear `<button>` with the `Button` primitive.
- **Refinement**: Updated the search `Input` to include `shadow-sm` and `transition-all duration-200 focus:shadow-md` for better visual feedback.
- **Refinement**: Centered the search results empty state and improved its description and layout.

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
- Updated divider background and text colors to use `border-[var(--border)] and `bg-[var(--card)]`.

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
- Standardized UI elements:
    - Replaced the manual search clear `<button>`, scroll-to-bottom button, and severity filter buttons with the `Button` primitive.
    - Ensured consistent sizing and hover states for all toolbar actions.

### `src/app/new/page.tsx`
- Created a new full-screen Project Creation Wizard with a 3-step flow (Select, Configure, Deploy).
- Uses `BackgroundBeams` for a premium background effect.
- Implemented a custom Stepper UI with `StepIndicator` component.
- **Step 1 (Select)**: Searchable repository list with `.card`-like styling using `bg-white/5` and `border-white/10` for glassmorphism effect.
- **Step 2 (Configure)**: Form for project settings and environment variables using consistent input styling (`bg-black/40`, `border-white/10`).
- **Step 3 (Deploy)**: Real-time terminal log console with `bg-black/80` and monospaced font, including status indicators and auto-scrolling.
- Uses `sonner` for toast notifications throughout the flow.
- Uses `lucide-react` icons for consistent visual language.
- **Refinement**: Step 3 status icons increased to `w-10 h-10` and added a pulse-glow effect to the loading state.
- **Refinement**: Upgraded the success card with a gradient background, increased padding (`p-8`), and enhanced spring entry animation.

## Phase 2: Micro-interactions & Final Polish

### `src/app/layout.tsx`
- Implemented global page transitions by wrapping the root layout content with `<PageTransition>`.

### `src/app/dashboard/layout.tsx`
- Removed `<PageTransition>` wrapper to avoid nested transitions and ensure a consistent experience across the app.

### `src/app/settings/team/page.tsx`
- Replaced the simple pulse loading state with a standardized `<Skeleton>` layout for better visual feedback.
- Upgraded the "Send Invite" button to use the `MovingBorder` `Button` component for high-priority action emphasis.
- Removed hardcoded background and text colors from `MovingBorderButton` to ensure full theme compatibility and allow the component's internal theming to take precedence.

### `src/app/dashboard/new/import/page.tsx`
- Upgraded the "Deploy" button to use the `MovingBorder` `Button` component.

### `src/app/dashboard/[id]/page.tsx`
- Upgraded the "Rollback" button (in deployment history) to use the `MovingBorder` `Button` component.
- Added a "Copy to Clipboard" button for the Git Commit SHA in the deployment history list, including a success checkmark state.
- **Refinement**: Enhanced the "Production Deployment" card with a subtle gradient background and a more prominent, shadow-enhanced "Live" status indicator.

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
- **Modernization**: Standardized configuration section headers with uppercase, tracking-wider labels for improved visual hierarchy.

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
- Replaced the manual search input and clear button with `Input` and `Button` primitives, ensuring focus and hover states are theme-consistent.

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
- Refactored environment variable list:
    - Replaced the manual remove `<button>` with the `Button` component (ghost icon variant).
    - Standardized hover and active states using `var(--error)` and `var(--error-bg)`.
    - Replaced hardcoded `text-blue-400` for secret indicators with semantic `text-[var(--info)]`.

### `src/app/dashboard/new/page.tsx`
- Fully refactored the legacy import page to use standard UI primitives: `Card`, `Input`, `Button`, `Skeleton`, and `Badge`.
- Standardized the search input and repository list items to match the main dashboard aesthetic.

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
- Standardized hover states across the switcher trigger and dropdown items using `var(--card-hover)`.

## Store & Logic Refactoring

### `src/store/project-slice.ts` & `src/store/settings-slice.ts`
- Removed all native browser `confirm()` and `alert()` calls from store actions.
- Shifted confirmation responsibility to the UI layer using the themed `ConfirmationModal` component, preventing double-confirmation dialogs.
- Standardized error handling to use the `settingsError` state or `toast` notifications for consistent user feedback.

### `src/app/settings/team/page.tsx`
- Refactored error display to a prominent, dismissible banner at the top of the page, ensuring that errors from any action (invite, remove, update) are clearly visible to the user.

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

## Dashboard Layout & Navigation Refactor (Session 76)

Modernized the main dashboard with a data-rich layout and enhanced navigation.

### `src/app/dashboard/page.tsx`
- Refactored the project list to use the `BentoGrid` and `ProjectCard` components, providing a more professional, "Command Center" feel.
- Enhanced the loading state with `BentoGridItem` skeletons that accurately mirror the new layout.
- Integrated the `CommandPalette` component directly into the dashboard for quick access to navigation and search.
- Standardized all interactive elements, including search inputs and action buttons, using the established `Button`, `Input`, and `Badge` UI primitives.

### `src/components/ProjectCard.tsx`
- Refactored to use the `Badge` component for status indicators, ensuring consistency with the rest of the application.
- Integrated `ProjectAvatar` for better visual identification of projects.
- Enhanced the sparkline visualization to dynamically reflect the project's current status (e.g., higher volatility for errors or builds).
- Improved the deployment metadata layout with a more compact, mono-spaced font and theme-consistent borders.
- Added a direct link to the production URL within the card for quicker access.

### `src/app/dashboard/[id]/page.tsx` (Project Overview)
- Upgraded the "Production Deployment" card with enhanced metadata, including framework tags, region info, and formatted last-push timestamps.
- Refined the production URL display with an integrated `ExternalLink` icon and improved hover states.
- Refactored the deployment history list for better readability on all screen sizes, utilizing compact `Badge` variants and standardized action buttons.
- Integrated the `MovingBorderButton` for the high-priority "Redeploy" action to provide a premium, interactive feel.
- Standardized status indicators (Healthy, Error, Building) using semantic theme colors and icons.

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

## Developer Experience & Backend Reliability (Session 94)

### Artifact Registry Management
- Implemented `src/lib/gcp/artifacts.ts` to handle Docker image lifecycle.
- Integrated `deleteProjectImages` into the project deletion flow to ensure full cleanup of GCP resources and prevent storage costs for deleted projects.

### Deployment Cancellation
- Refined the cancellation API in `src/app/api/projects/[id]/deploy/route.ts` to update the database status before calling the GCP API, ensuring a more responsive UI and stopping polling loops immediately.

### Environment Variable Validation
- Added smart validation for database connection strings (PostgreSQL, Redis, MongoDB) in `src/lib/utils.ts`.
- The environment variable API now returns descriptive warnings for malformed connection strings, helping developers catch configuration errors early.

### CLI Versioning
- Added a dedicated `version` command and flag support (`-v`, `--version`) to the Deployify CLI for better version tracking.

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

## Progressive UI & Theme Consistency Refactor (Session 72)

Refactored remaining components with hardcoded colors to use the semantic theme system, ensuring consistency across light and dark modes.

### `src/components/CronsSection.tsx`
- Replaced hardcoded blue colors in the "How it works" section with semantic theme variables (`var(--info-bg)`, `var(--info)`).
- Verified table and action button styling uses theme variables.

### `src/components/DomainsSection.tsx`
- Replaced hardcoded status colors (green, yellow, red) with semantic variables (`var(--success)`, `var(--warning)`, `var(--error)`).
- Replaced hardcoded orange colors in the Cloudflare setup guide with `var(--warning)` for better theme integration.
- Updated status icons and text to use the new semantic variables.

### `src/components/EnvVariablesSection.tsx`
- Replaced hardcoded blue and green colors with semantic theme variables (`var(--info)`, `var(--success)`).
- Updated the "Secret" shield icon and copy button success state to use theme variables.
- Replaced the info box background and border with `var(--info-bg)` and `var(--info)`.

### `src/components/ui/tracing-beam.tsx`
- Replaced hardcoded light-mode colors (`white`, `neutral-200`, `#9091A0`) with semantic theme variables (`var(--background)`, `var(--border)`, `var(--muted-foreground)`).
- Ensured the component adapts correctly to dark mode.

### `src/components/ui/background-beams.tsx`
- Replaced the hardcoded `#333` grid color with `var(--muted-foreground)` to ensure visibility and appropriate contrast in both light and dark modes.

### `src/components/ui/bento-grid.tsx`
- Replaced the potentially undefined `shadow-input` class with `shadow-[var(--shadow-sm)]` (using the defined CSS variable) to ensure consistent shadow styling.

## Progressive UI & Theme Consistency Refactor (Session 73)

Conducted a pass to refine loading states and ensure consistent spacing across major wizard and dashboard flows.

### `src/app/new/page.tsx` (Project Creation Wizard)
- Replaced manual `animate-pulse` divs in the repository selection step with the standardized `Skeleton` component.
- Increased the number of skeleton placeholders from 3 to 5 to better fill the viewport during initial load.
- Verified that all configuration cards use standard `Card` padding (`p-6`) and spacing (`space-y-6`) for visual consistency with the main dashboard.

### `src/components/TeamSwitcher.tsx`
- Replaced the manual `animate-pulse` div in the loading state with the standardized `Skeleton` component for better theme integration.

### `src/app/dashboard/page.tsx`
- Refined the loading state to accurately reflect the project card layout.
- Added skeletons for the project avatar, name, repo, status badge, production URL, and footer metadata.
- Increased the number of skeleton placeholders to 6 for a more complete initial load experience.

### `src/components/LogViewer.tsx`
- Refactored the connection status indicator to use the `Badge` component.
- Refactored the search input to use the `Input` component with custom sizing and background.
- Replaced manual toolbar buttons with the `Button` component (ghost icon variant) for consistent interaction states.
- Standardized severity filter buttons to use `font-bold` and semantic background variables.

### `src/components/LandingPage.tsx`
- Verified that the landing page and its dependencies (`TracingBeam`, `BackgroundBeams`, `BentoGrid`) now fully adhere to the semantic theme system.

## Dashboard & Navigation Polish (Session 93)

Conducted a targeted pass to standardize the dashboard overview and enhance the project navigation experience.

### `src/app/dashboard/page.tsx` (Dashboard Overview)
- **Standardized Header**: Updated the page header to use `text-3xl font-bold tracking-tight` for titles and `text-lg` for descriptions, ensuring consistency with project-specific dashboards.
- **Visual Emphasis**: Upgraded the "Add New" button to use the `MovingBorderButton` component, highlighting it as the primary call-to-action on the main dashboard.
- **Layout Consistency**: Wrapped the title and description in a `space-y-1` container for better vertical rhythm.

### `src/app/dashboard/[id]/page.tsx` (Project Overview)
- **Icon Integration**: Added the `Globe` icon to the "Production Deployment" card header and the `History` icon to the "Deployment History" section header, enhancing the visual hierarchy and alignment with the platform's standard UI patterns.

### `src/app/dashboard/[id]/deployments/page.tsx` (Deployments)
- **Header Standardization**: Added the `GitCommit` icon to the page header, providing a clearer visual anchor and consistent branding across sub-pages.

### `src/app/dashboard/[id]/analytics/page.tsx` (Analytics)
- **Header Standardization**: Added the `BarChart3` icon to the page header, aligning the analytics view with the standardized icon-based header system.

### `src/app/dashboard/[id]/logs/page.tsx` (Logs)
- **Header Standardization**: Added the `Terminal` icon to the page header, consistent with the build log viewer branding.

### `src/app/dashboard/[id]/settings/page.tsx` (Settings)
- **Header Standardization**: Added the `Settings` icon to the page header, following the icon-led hierarchy for all primary project views.

### `src/components/ProjectNav.tsx`
- **Interactive Navigation**: Implemented a smooth, sliding active tab indicator using `framer-motion`'s `layoutId`. This provides better visual continuity when switching between different project views.
- **Visual Polish**: Refined the tab styling to focus on the content while the animated indicator handles the active state branding.

### `src/components/ProjectCard.tsx`
- **Typography Refinement**: Standardized project metadata (Branch, Date, Production URL) to use `text-[10px] font-bold uppercase tracking-wider`, aligning with the platform's professional dashboard aesthetic.
- **Visual Consistency**: Improved vertical rhythm and spacing for deployment information within the card.

## UI & Theme Consistency Refinement (Session 74)

Conducted a targeted pass to harmonize UI primitives and improve visual consistency across the dashboard and deployment flows.

### UI Primitives (`src/components/ui/`)
- **`Button`**: Updated the `primary` variant to use `bg-[var(--gradient-primary)]` and added a complex shadow (`var(--shadow-md)` with a custom blue glow) and hover translation effects. This ensures that the `Button` component exactly matches the branding defined in the global CSS.
- **`Badge`**: Added an `error` variant using `var(--error)` and `var(--error-bg)` for semantic consistency with existing `success`, `warning`, and `info` badges.

### Project Dashboard & Cards
- **`ProjectCard`**: Refactored the sparkline sparkline to use CSS variables (`var(--success)`, `var(--info)`, etc.) for its stroke color, ensuring the visualization automatically adapts to theme changes and matches status indicators.
- **Project Detail Page**: Refactored the deployment status display to use the `Badge` component instead of manual icons and text. This provides a more consistent and professional look across the deployment history.

### Deployment Wizard
- **Step 3 (Deploy)**: Refined the terminal log viewer to match the main `LogViewer` aesthetic. Added a "Build Logs" label with a `Terminal` icon to the header, and implemented hover effects and transitions for individual log lines, improving the overall interactive feel.

### Global Navigation & Layout
- **`TeamSwitcher`**: Standardized the "Personal Workspace" icon by refactoring it to use the `Avatar` and `AvatarFallback` components. This ensures consistent sizing, rounding, and styling across all workspace and team selectors.
- **`DashboardSidebar`**: Updated navigation item hover and active states to use `var(--card-hover)` instead of `var(--background)`. This provides better visual contrast and a more consistent "layered" feel on the sidebar's card-like background.

### Theme & Code Hygiene
- **CSS Variable Consolidation**: Introduced `--primary-glow` and `--primary-glow-hover` variables in `globals.css` to replace hardcoded indigo shadow values. These variables are now used by both the `.btn-primary` utility class and the `Button` UI primitive.
- **Repository Cleanup**: Removed development-only artifacts (`dev_server.log` and the `verification/` screenshot directory) to maintain a clean codebase.

## Final Polish & Theme Consistency (Session 75)

Conducted a final comprehensive audit and refactoring of UI components to eliminate remaining hardcoded values and ensure perfect theme adaptability.

### `src/components/ui/spotlight.tsx`
- Updated the default `fill` color to use `var(--foreground)` instead of hardcoded `white`. This ensures the spotlight effect is visible and correctly themed in both light (black) and dark (white) modes if no specific fill color is provided.

### `src/components/ui/background-beams.tsx`
- Replaced the hardcoded `indigo-500` gradient color with `var(--info)`. This aligns the background beam effect with the application's semantic color system (Blue/Info) instead of introducing an arbitrary color.

### `src/components/ui/tracing-beam.tsx`
- Replaced hardcoded hex colors (`#18CCFC`, `#6344F5`, `#AE48FF`) with semantic theme variables (`var(--info)` and `var(--primary)`).
- This ensures the tracing beam gradient automatically adapts to theme changes (e.g., switching from blue/black in light mode to blue/white in dark mode) and maintains consistency with the rest of the application's color palette.

### `src/components/ui/switch.tsx`
- Fixed a visibility issue in Dark Mode where the toggle thumb (white) would disappear against the checked track background (primary/white).
- Added `peer-checked:after:bg-[var(--primary-foreground)]` to the thumb element.
- **Logic**:
  - **Light Mode**: Track is Black (`primary`), Thumb becomes White (`primary-foreground`). High contrast.
  - **Dark Mode**: Track is White (`primary`), Thumb becomes Black (`primary-foreground`). High contrast.
  - **Unchecked**: Thumb remains White (default) against Gray track (`border`). Standard UI pattern.

## Unified Log Viewing & Consistency (Session 77)

Unified the build log viewing experience and improved loading state consistency.

### `src/components/BuildLogViewer.tsx`
- Refactored to support line-by-line rendering with hover effects, matching the "terminal" aesthetic.
- Updated `loading` state to only show skeletons when no logs are present, allowing immediate feedback during streaming.
- Improved `error` display to appear at the bottom of the logs instead of replacing them, preserving context.

### `src/app/new/page.tsx` (Project Creation Wizard)
- **Step 3 (Deploy)**: Replaced the manual log rendering implementation with the updated `BuildLogViewer` component.
- This ensures a consistent log viewing experience between the wizard and the dashboard modals.

### `src/components/ui/skeleton.tsx`
- Updated the default background color from `bg-[var(--border)]` to `bg-[var(--muted)]/20`.
- This provides a more subtle and refined loading state that works better across light and dark modes without requiring manual overrides.

## Progressive UI & Theme Consistency Refactor (Session 78)

Conducted a consistency pass to ensure high-priority deployment actions use the premium `MovingBorderButton` component.

### `src/app/new/page.tsx` (Project Creation Wizard)
- **Step 2 (Configure)**: Upgraded the "Deploy Project" button to use the `MovingBorderButton` component, replacing the standard `Button` with a `rounded-full` override. This ensures a consistent "premium" feel for the primary call-to-action in the wizard.

### `src/app/dashboard/new/import/page.tsx` (Legacy Import)
- Upgraded the "Deploy" button to use the `MovingBorderButton` component, replacing the standard `Button`. This aligns the legacy import flow with the new wizard and dashboard aesthetics.

## Progressive UI & Micro-interactions Refinement (Session 79)

Conducted a targeted pass to harmonize UI components and introduce subtle micro-interactions across the platform.

### `src/app/new/page.tsx` (Project Creation Wizard)
- **Environment Variables**:
    - Replaced the native checkbox for secrets with the `Switch` component, providing a more modern and accessible toggle.
    - Replaced `NativeSelect` elements for Target and Scope with themed pill-style buttons, matching the aesthetic of the main project settings and improving touch targets.
- **Visual Hierarchy**:
    - Standardized container spacing to `space-y-8` and ensured all `Card` components use consistent `p-6` padding.
    - Updated repository list items in Step 1 to use `p-6` padding for better readability.

### `src/app/dashboard/settings/page.tsx` (Team Settings)
- **Danger Zone Polish**: Updated the "Danger Zone" card to use a consistent `border-[var(--error)]/30` and `bg-[var(--error)]/5` styling, mirroring the project-level settings.
- **Visual Structure**: Integrated the `Separator` component to clearly define sections within cards, replacing manual border lines for better maintainability.

### `src/components/ProjectCard.tsx`
- **Dynamic Glow**: Introduced a status-aware hover effect. The card now emits a subtle glow matching the project's current status (e.g., `var(--success-bg)` for healthy projects, `var(--error-bg)` for projects with issues) when hovered.
- **Layout Consistency**: Ensured perfectly rounded corners and smooth transitions for all interactive states.

### `src/components/OnboardingGuide.tsx`
- **Button Consistency**: Updated the `MovingBorderButton` to use standard primary colors (`var(--primary)`, `var(--primary-foreground)`) and a custom primary glow shadow, ensuring it stands out as the primary call-to-action while maintaining theme consistency.
- **Layout Refinement**: Increased the button width for better balance and visual impact.

## Progressive UI & Micro-interactions Refinement (Session 80)

Conducted a targeted pass to harmonize UI components and introduce subtle micro-interactions across the platform.

### `src/components/ui/segmented-control.tsx`
- Created a new reusable `SegmentedControl` component for pill-style selections.
- Features smooth `framer-motion` transitions for the active state indicator using `layoutId`.
- Styled with theme variables for consistent appearance across light and dark modes.

### `src/app/new/page.tsx` (Project Creation Wizard)
- **StepIndicator**: Refactored to use `framer-motion` for smoother state transitions. Added animations for completed steps (checkmark scale-in) and active steps (subtle pulse).
- **Repository Search**: Added a keyboard shortcut hint (⌘K / Ctrl+K) and implemented the focus logic.
- **Repository Cards**: Added `whileHover` and `whileTap` animations using `framer-motion`. Included a subtle background gradient effect on hover for a more premium feel.
- **Configuration**: Replaced manual pill-style buttons for Target and Scope with the new `SegmentedControl` component.

### `src/components/EnvVariablesSection.tsx`
- Refactored the environment variable creation form to use the `SegmentedControl` component for Target and Scope selections, ensuring consistency with the creation wizard.

### `src/app/dashboard/[id]/page.tsx` (Project Overview)
- **Production Card Polish**:
    - Replaced the manual framework tag with the `Badge` component (outline variant).
    - Enhanced the "Live" status indicator with a CSS `animate-ping` effect for better visibility.
    - Improved the hover interaction on the production URL with a transition-aware color shift and an animated external link icon.

## Progressive UI & Refactoring (Session 81)

Conducted a targeted pass to refactor deployment lists and settings toggles into reusable components.

### `src/components/StatusBadge.tsx`
- Created a reusable `StatusBadge` component that maps deployment statuses (ready, error, building, queued, cancelled) to standard `Badge` variants.
- Encapsulates icon selection and animation logic (e.g., spinning loader for building states).

### `src/components/DeploymentListItem.tsx`
- Extracted the deployment row rendering logic from `DeploymentsPage` into a reusable component.
- Encapsulates actions (View, Logs, Rollback, Cancel) and copy-to-clipboard functionality.
- Uses `StatusBadge` for consistent status display.

### `src/app/dashboard/[id]/deployments/page.tsx`
- Refactored to use `DeploymentListItem`, significantly reducing code duplication and improving readability.
- Removed local helper functions that are now handled by the child component.

### `src/components/SettingsToggle.tsx`
- Created a reusable component for the "Label + Description + Switch" pattern used in settings pages.
- Standardizes layout, spacing, and interaction states (hover, pointer cursor).

### `src/app/dashboard/[id]/settings/page.tsx`
- Refactored "Automatic PR Deployments", "Email Notifications", and "Cloud Armor" sections to use `SettingsToggle`.
- Improved code maintainability by removing repetitive markup.

## Progressive UI & Refactoring (Session 82)

Conducted a targeted pass to refactor Core Web Vitals and improve navigation consistency.

### `src/components/WebVitals.tsx`
- Refactored to use the `Card` and `Badge` components, eliminating manual `card` classes and custom status colors.
- Standardized status mapping to semantic `Badge` variants (`success`, `warning`, `error`).
- Improved layout with `rounded-xl` and `bg-[var(--muted)]/5` for a more modern, layered feel.
- Added hover transitions to individual metric cards for better interactivity.

### `src/components/DashboardSidebar.tsx`
- Upgraded the theme switcher to a modern, split-button design with `Sun` and `Moon` icons.
- Added a dynamic active navigation indicator using `framer-motion` (`layoutId`) that smoothly slides between active routes.
- Refined navigation item styling with a subtle primary-tinted background and bold font for the active state.
- Integrated `cn` utility for cleaner conditional class management.

### `src/app/new/page.tsx`
- Refined the deployment status view (Step 3) with larger, animated icons and semantic status-aware colors.
- Added a celebratory "Project Summary" card that appears upon successful deployment, featuring a `Rocket` icon and prominent project metadata.
- Integrated the `MovingBorderButton` for the "Visit App" action to provide a high-priority call-to-action on success.
- Improved the layout responsiveness for different screen sizes during the deployment phase.

### `src/components/LandingPage.tsx`
- Refined "The Method" section with staggered entry animations for each step using `framer-motion`.
- Improved step indicators with larger, more prominent numbering and hover effects.
- Enhanced pricing comparison cards with `translate-y` transitions and a subtle primary glow for the Deployify plan.
- Increased padding and border-radius for pricing cards to create a more premium, modern aesthetic.

## Progressive UI & Consistency Refactor (Session 83)

Conducted a pass to standardize the Team Settings and Billing pages, and improve the legacy import flow.

### `src/app/dashboard/settings/page.tsx` (Team Settings)
- **Standardized Danger Zone**: Updated the "Danger Zone" card to use a consistent `border-[var(--error)]/30` and `bg-[var(--error)]/5` styling, mirroring the project-level settings.
- **Section Polish**: Added `Separator` components and improved descriptions for the "Invite Members" and "Danger Zone" sections.
- **Button Consistency**: Replaced manual button styles with standard `variant="ghost"` and `variant="destructive"` where appropriate, ensuring consistent hover and active states.
- **Code Hygiene**: Removed unused Lucide icons and ESLint disable comments.

### `src/app/billing/page.tsx` (Billing)
- **Standardized Feedback**: Replaced all native browser `alert()` calls with the themed `toast` notifications for a more integrated and professional user experience.
- **Header Refinement**: Ensured the 'Current Plan' section uses consistent spacing and typography within the sticky header.

### `src/app/dashboard/new/import/page.tsx` (Legacy Import)
- **Modern Controls**: Replaced the environment variable target dropdown with the reusable `SegmentedControl` component, providing a more modern and consistent UI.
- **Visual Emphasis**: Applied the `shadow-[var(--primary-glow)]` to the main "Deploy" button to align with high-priority action standards across the platform.

## Progressive UI & Refactoring (Session 84)

Conducted a targeted pass to harmonize UI components across the platform, focusing on replacing `NativeSelect` with `SegmentedControl` and using `MovingBorderButton` for high-priority actions.

### `src/app/edge-debug/page.tsx`
- **Modern Controls**: Replaced the HTTP method `NativeSelect` with the `SegmentedControl` component for a more modern, pill-style selection.
- **Visual Emphasis**: Upgraded the "Run Simulation" button to use the `MovingBorderButton` component, highlighting it as the primary action on the page.
- **Styling Consistency**: Refactored the headers `textarea` to use standard `Input` styling via `cn` for better visual consistency with other form elements.

### `src/components/LogViewer.tsx`
- **Tab Navigation**: Replaced manual tab buttons with the `SegmentedControl` component for switching between Runtime, System, and Build logs. This provides smoother animations and a more cohesive look.

### `src/components/RollbackModal.tsx`
- **High-Priority Action**: Upgraded the "Confirm Rollback" button to use the `MovingBorderButton` component, emphasizing the significance of the rollback operation.

### `src/components/CreateTeamModal.tsx`
- **Primary Action**: Upgraded the "Create Team" button to use the `MovingBorderButton` component, aligning it with other creation flows in the application.

### `src/components/ResourceSettings.tsx`
- **Improved UX**: Replaced `NativeSelect` dropdowns for CPU and Memory selection with `SegmentedControl` components. Since the options are few (1/2/4 vCPU, 5 memory sizes), this provides faster selection and better visibility of available choices.

## Progressive UI & Consistency Refactor (Session 85)

Continued the push for a unified UI across all pages, focusing on analytics consistency and legacy page modernization.

### `src/components/analytics/AnalyticsCharts.tsx`
- **Standardized Summary Cards**: Refactored `SummaryCard` to use the standard `Card` component with consistent padding, typography, and hover-driven visual feedback (border/shadow).
- **Web Vital Badge Integration**: Replaced manual status indicators in `WebVitalCard` with the `Badge` component, utilizing semantic variants (`success`, `warning`, `error`) for better consistency.
- **Tooltip Polish**: Refined the `AnalyticsTooltip` by replacing hardcoded shadow and ring classes with theme-consistent variables and shadows.

### `src/app/dashboard/new/page.tsx`
- **Modernized Repository List**: Refactored the legacy repository import page to match the premium aesthetic of the new creation wizard.
- **Micro-interactions**: Added `framer-motion` animations (`whileHover`, `whileTap`, `layout`) and entry transitions for a more dynamic feel.
- **Enhanced Search**: Integrated a keyboard shortcut hint (⌘K / Ctrl+K) and auto-focus logic for the search input.
- **Visual Polish**: Standardized repository icons with status-aware colors and added a gradient hover effect for a "layered" visual depth.

### `src/app/dashboard/new/import/page.tsx`
- **Standardized Section Headers**: Added icons and descriptions to project configuration sections, aligning with the new wizard's visual hierarchy.
- **Improved Spacing**: Updated layout to use `space-y-8` and standardized card padding (`p-6`) for better visual consistency.
- **Enhanced Typography**: Standardized form labels to use `text-xs font-bold uppercase tracking-wider` for a more professional dashboard look.
- **Modern Controls**: Integrated `Switch` and `SegmentedControl` components for environment variable management, replacing legacy form elements.

### `src/app/dashboard/[id]/analytics/page.tsx`
- **Period Selector**: Added a modern period selection control (1h, 24h, 7d, 30d) using the `SegmentedControl` component, providing a better UX for switching timeframes.
- **Layout Alignment**: Standardized page padding (`px-6 md:px-8 py-8`) and spacing (`space-y-10`) to align with the Project Overview and other dashboard pages.
- **Refined Header**: Improved the typography and layout of the analytics header, including site identification and real-time visitor integration.

## Unified Settings & Join Flow Polish (Session 86)

Conducted a comprehensive pass to unify settings management and polish the team invitation experience.

### `src/app/dashboard/settings/page.tsx` (Team/Account Settings)
- **Unified Logic**: Completely refactored the page to use the centralized `useStore` (Zustand) for data management, replacing local state and manual fetch calls for better consistency across the application.
- **Audit Log Integration**: Integrated the professional **Audit Log** sidebar (previously only in an orphaned page) to track all team activities directly within the main settings view.
- **Enhanced Account Settings**: Added a dedicated view for personal workspaces, featuring a **Personal Profile** card and a **Danger Zone** with a "Delete Account" action.
- **Role Management**: Implemented real-time role updates for team members using a themed `NativeSelect` component.
- **Layout Optimization**: Upgraded the page layout to `max-w-6xl` to support a multi-column design with the audit log sidebar, improving information density.
- **UI Standardization**: Ensured all buttons, cards, and interactive elements strictly follow the established design system (standardized padding, theme-aware colors, and consistent hover states).

### `src/app/join/` (Team Invitation Flow)
- **`page.tsx`**: Enhanced the invitation landing page with `BackgroundBeams` for a premium look. Refined error states (Invalid, Expired, Team Not Found) with custom icons and improved typography. Added a pulse-glow effect to the team avatar.
- **`JoinButton.tsx`**: Upgraded the primary join action to use the `MovingBorderButton` component. Added smooth entry/exit animations for error messages using `framer-motion`.

### Code Hygiene & Cleanup
- **Orphaned Page Removal**: Successfully removed the redundant `src/app/settings/` directory, consolidating all team and account settings into the dashboard structure.
- **Global Error Handling**: Integrated standardized error toast notifications into the settings store logic for more reliable user feedback.

## Standardized Icons & Join Flow Polish (Session 87)

Conducted a final consistency pass to replace local SVG icons with standard Lucide icons in the invitation flow.

### `src/app/join/page.tsx`
- **Icon Standardization**: Replaced locally defined SVG icons (`X`, `AlertTriangle`, `Clock`, `Users`) with imports from `lucide-react`. This ensures that all error and status states (Invalid, Expired, Team Not Found) match the visual style of the rest of the application.
- **Refinement**: Upgraded error state cards with increased padding (`p-10`), larger icons (`w-10 h-10`), and a modern `rounded-2xl` look with a subtle shadow glow.

### `src/app/(marketing)/login/page.tsx`
- **Refinement**: Enhanced the login card with increased padding (`p-10`), tracking-tight typography for the title, and a larger subtitle for better readability.

## Progressive UI & API Support Refactor (Session 88)

Conducted a pass to harmonize selection controls across the platform and implemented backend support for personalized account settings.

### `src/components/ui/segmented-control.tsx`
- **Component Enhancement**: Updated the `SegmentedControl` component to support `ReactNode` labels. This allows passing icons along with text or custom markup into the selection pills.
- **Layout Flexibility**: Added `flex-1` support to the individual option buttons when the container is set to `w-full`, ensuring equal-width tabs in full-width layouts.

### `src/components/DashboardSidebar.tsx`
- **Theme Switcher Upgrade**: Refactored the custom theme switcher to use the `SegmentedControl` component. Integrated `Sun` and `Moon` icons into the labels, providing a smoother, `framer-motion` powered transition between light and dark modes.

### `src/app/dashboard/settings/page.tsx` (Team/Account Settings)
- **Role Selection Modernization**: Replaced the `NativeSelect` dropdown in the "Invite New Member" form with the `SegmentedControl` component.
- **Member List Polish**: Refactored member role updates to use a compact `SegmentedControl` instead of a dropdown, making role management a single-tap operation.
- **Personalized Profile View**: Integrated data from the new `/api/user` endpoint. When no team is active, the "Personal Profile" card now displays the user's actual GitHub avatar, full name, and email address, replacing generic placeholders.

### `src/components/BranchDeploymentsSettings.tsx`
- **Modern Environment Selection**: Replaced the `NativeSelect` for choosing the branch target environment (Production vs Preview) with the `SegmentedControl` component.

### Backend & API
- **New User Endpoint (`src/app/api/user/route.ts`)**:
    - **GET**: Implemented a route to return the current user session data, facilitating personalized UI rendering on the client side.
    - **DELETE**: Implemented a route for account deletion, ensuring that the frontend "Delete Account" action has a corresponding backend implementation that cleans up the user document and clears session cookies.
- **Code Quality**: Verified all changes with unit tests and confirmed no regressions in core deployment or billing logic.

## Progressive UI & Final Polish (Session 89)

Conducted a comprehensive UI refinement pass across Login, Dashboard, and Billing pages to elevate the visual quality and consistency.

### `src/app/(marketing)/login/page.tsx` (Login Page)
- **Refined Layout**: Centered the login card vertically and horizontally using `flex items-center justify-center` and `min-h-screen`.
- **Premium Styling**: Replaced the standard "Continue with GitHub" button with the `MovingBorderButton` component for a high-quality feel.
- **Gradient Typography**: Applied `bg-clip-text text-transparent bg-gradient-to-b` to the "Welcome back" title for a modern, depth-enhancing effect.

### `src/app/dashboard/page.tsx` (Dashboard Overview)
- **Entry Animation**: Wrapped the `BentoGrid` in a `framer-motion` `div` with `initial={{ opacity: 0, y: 20 }}` and `animate={{ opacity: 1, y: 0 }}`. This adds a smooth, professional entry animation when the dashboard loads.

### `src/app/dashboard/[id]/page.tsx` (Project Details)
- **Visual Hierarchy**: Upgraded the "Visit" button in the Production Deployment card to use the `MovingBorderButton` component, clearly distinguishing the primary action from secondary controls.

### Billing & Components
- **`PricingCard` Polish**: Cleaned up the component by removing unused, commented-out CSS classes.
- **`ComparePlansTable` Refinement**: Updated the "Current Plan" indicator to use the `secondary` badge variant, ensuring better contrast and adherence to the semantic theme system.

## Progressive UI & Search Unification (Session 90)

Conducted a targeted pass to unify the search experience and standardize project sub-page layouts for better consistency.

### `src/components/CommandPalette.tsx`
- **Global Accessibility**: Updated the component to listen for a custom `open-command-palette` event, allowing it to be triggered programmatically from anywhere in the application.
- **Event Handling**: Ensured proper cleanup of the event listener to prevent memory leaks.

### `src/components/Header.tsx`
- **Search Integration**: Added a prominent search button to the global header that triggers the `CommandPalette`.
- **Keyboard Hint**: Displayed the `⌘K` / `Ctrl+K` shortcut hint within the search button for better discoverability.
- **Responsive Design**: Hidden the search button on mobile to preserve screen real estate, relying on existing mobile-optimized navigation.

### `src/app/dashboard/page.tsx` (Dashboard Overview)
- **Shortcut Unification**: Changed the local project list search focus shortcut from `⌘K` to `/`. This follows industry standards (e.g., GitHub, Slack) and avoids conflict with the global command palette.
- **UI Hint**: Updated the search input hint to display the `/` key instead of `⌘K`.

### Project Sub-pages (`Logs`, `Analytics`, `Deployments`)
- **Header Standardization**: Refactored the headers across all project sub-pages to use `text-3xl font-bold tracking-tight` for titles and `text-lg` for descriptions, aligning them with the main Project Overview.
- **Consistent Layout**: Standardized the container spacing to `space-y-10` and improved vertical rhythm across these views.
- **Breadcrumb Consistency**: Ensured that the header's breadcrumb logic correctly identifies and labels project-specific routes.

### Project Overview & Billing Polish
- **`src/app/dashboard/[id]/page.tsx`**: Enhanced the "Live" status indicator in the Production Deployment card with an `animate-pulse-glow` effect and improved shadow depth for a more premium "real-time" feel.
- **`src/components/billing/PricingCard.tsx`**: Introduced a high-contrast highlight for the "Most Popular" plan using `shadow-[var(--info-bg)]` and a subtle border tint. Improved hover states to `shadow-xl` for better interactivity.

## Progressive UI & Refactoring (Session 91)

Conducted a targeted pass to refactor deployment comparison and cron jobs management.

### `src/app/dashboard/[id]/deployments/compare/page.tsx`
- **Standardized Header**: Refactored the page header to use a 3-step structure: a themed "Back" button, a `text-3xl font-bold` title, and a `text-lg` description.
- **Visual Hierarchy**: Upgraded all section headers and table labels to the `text-xs font-bold uppercase tracking-wider` standard for improved professional aesthetic.
- **Deployment Summaries**: Refined the summary cards with better typography, increased padding, and theme-consistent background gradients (`bg-[var(--muted)]/5`).
- **Comparison Table**: Standardized the comparison results table with hover transitions and subtle status-aware typography.
- **Loading State**: Enhanced the skeleton layout to accurately mirror the new page structure.

### `src/components/CronsSection.tsx`
- **Modern Controls**: Replaced the predefined schedule `NativeSelect` with the `SegmentedControl` component for a more fluid, interactive selection experience.
- **Table Standardization**: Upgraded the cron jobs list headers to use the `text-xs font-bold uppercase tracking-wider` styling, ensuring consistency with the rest of the project settings.
- **Visual Polish**: Refined the "Add Cron Job" form with standardized spacing and border-radius.

## Progressive UI & Section Headers Refactor (Session 92)

Conducted a targeted pass to harmonize section headers with standard `lucide-react` icons across Analytics and Settings pages.

### `src/app/dashboard/[id]/analytics/page.tsx`
- **Icon Integration**: Added the `Activity` icon to the `Deployment Performance` and `Traffic Analytics` section headers.
- **Visual Alignment**: Wrapped the icons and header text in a flex container (`flex items-center gap-2`) to match the platform's standard UI hierarchy.

### `src/app/dashboard/[id]/settings/page.tsx`
- **Icon Standardization**: Integrated specific `lucide-react` icons to the configuration headers to align with the Team Settings page aesthetic:
    - Added `Settings` icon to "Configuration" under Build Settings.
    - Added `Bell` icon to "Alert Preferences" under Notifications.
    - Added `Shield` icon to "Safety & Protection" under Security.
    - Added `AlertTriangle` icon to "Critical Actions" under Danger Zone.
- **Visual Alignment**: Ensured all headers utilize the `flex items-center gap-2` utility for consistent spacing and alignment with their respective icons.
