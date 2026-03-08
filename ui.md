# UI/UX Standards and Updates Log

This document tracks UI standardization updates across the application to maintain consistent visual hierarchy, spacing, typography, and interactive states.

## Global Classes and Design Tokens
- **Root Layouts**: `max-w-7xl mx-auto px-6 md:px-8 py-8 space-y-10` applied to all dashboard page wrappers.
- **Section Headers (Settings, Danger Zone, etc.)**: `text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)] mb-2`
- **Metadata Tags (Commits, Badges, Types)**: `text-[10px] font-bold uppercase tracking-wider`
- **Action Buttons**: Standardized using `MovingBorderButton` with consistent container sizing (`h-10 w-36` or contextual).
- **Icons**: Sized `w-5 h-5` for standard headings and `w-8 h-8` for page titles.

## Progressive UI & Layout Standardization (Session 103)

Conducted a comprehensive pass to standardize page layouts and headers across the dashboard, settings, and comparison pages.

### Dashboard Header Architecture (Standardized)
- **3-Part Header Standard**: All primary dashboard pages and section cards now follow a unified 3-part visual hierarchy:
  1. **Icon Container**: Lucide icon in a themed background (`rounded-2xl bg-[var(--primary)]/10` for pages, `rounded-xl` for sections).
  2. **Context Label**: Uppercase metadata label (`text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]`).
  3. **Main Title**: Bold tracking-tight title (`text-3xl font-bold` for pages, `text-xl font-semibold` for sections).

### Pages Updated
- `src/app/dashboard/[id]/page.tsx` (Project Overview)
- `src/app/dashboard/[id]/deployments/page.tsx` (Deployments)
- `src/app/dashboard/[id]/analytics/page.tsx` (Analytics)
- `src/app/dashboard/[id]/logs/page.tsx` (Logs)
- `src/app/dashboard/[id]/settings/page.tsx` (Project Settings)
- `src/app/dashboard/settings/page.tsx` (Account/Team Settings)

### Components & Section Standardized
- `DomainsSection.tsx` (Networking)
- `EnvVariablesSection.tsx` (Configuration)
- `RegionSettings.tsx` (Infrastructure)
- `ResourceSettings.tsx` (Performance)
- `BranchDeploymentsSettings.tsx` (Automation)
- `CronsSection.tsx` (Scheduling)

### Metadata & Interactive States
- **Metadata Standard**: Enforced `text-[10px] font-bold uppercase tracking-wider` for all technical metadata (branches, SHAs, timestamps) in `DeploymentListItem.tsx`.
- **Badge Consistency**: Standardized badge padding (`px-1.5 py-0.5`) and typography across the platform.

### Dashboard & Settings Layouts
- **Files Updated**:
  - `src/app/dashboard/page.tsx`
  - `src/app/dashboard/settings/page.tsx`
  - `src/app/dashboard/[id]/settings/page.tsx`
  - `src/app/dashboard/new/page.tsx`
  - `src/app/dashboard/new/import/page.tsx`
  - `src/app/dashboard/[id]/deployments/compare/page.tsx`
- **Standardization**: Enforced the strict use of `max-w-7xl mx-auto px-6 md:px-8 py-8 space-y-10` for the outer container on all views to ensure visual consistency when navigating between sections. Removed arbitrary padding (`pb-24`) where it broke layout symmetry.

### NativeSelect Interactivity
- **File Updated**: `src/components/ui/native-select.tsx`
- **Standardization**: Added `hover:bg-[var(--card-hover)]` and `cursor-pointer` to improve the interactive feel of dropdown menus (e.g., target environment selection, region selection), matching the behavior of standard buttons and list items.

### MovingBorderButton Refinement
- **Files Updated**:
  - `src/app/dashboard/page.tsx`
  - `src/app/dashboard/settings/page.tsx`
  - `src/app/dashboard/[id]/settings/page.tsx`
- **Standardization**: Standardized all primary action buttons ("Add New", "Save Changes", "Save Preferences", "Send Invite") using the `MovingBorderButton` component. Ensured uniform container sizing (`containerClassName="h-10 w-36"`) and typography (`text-xs font-bold`) to create a predictable and balanced visual rhythm for call-to-actions.

### Technical Metadata Typography
- **Files Updated**:
  - `src/app/dashboard/[id]/deployments/compare/page.tsx`
  - `src/components/DeploymentListItem.tsx`
  - `src/components/ProjectCard.tsx`
- **Standardization**: Audited all instances of `text-[10px]` styling and strictly enforced the `font-bold uppercase tracking-wider` standard for technical labels (like "Environment", "Created", "No deployments yet", and deployment status badges). This unifies the platform's professional, developer-focused aesthetic.

## Progressive UI & Layout Standardization (Session 104)

Continued standardizing the application layout and ensuring consistency across all configuration cards and settings pages.

### Internal Card Sections Standardization
- **File Updated**: `src/app/dashboard/[id]/settings/page.tsx`
- **Standardization**: Updated "Build Settings", "Notifications", "Security", and "Danger Zone" cards to rigorously adhere to the section standard defined in Session 103:
  - Ensured all setting cards use `<Card className="overflow-hidden p-0">`.
  - Added padded flex headers `p-6` alongside the standardized 3-part header (Icon Container + Context Label + Main Title).
  - Explicitly separated the header from content using `<Separator className="bg-[var(--border)]" />` (or `bg-[var(--error)]/20` for Danger Zone).
  - Re-wrapped section contents inside a generic `<div className="p-6">` padding container.

### Error Page Header Standard
- **Files Updated**:
  - `src/app/dashboard/error.tsx`
  - `src/app/dashboard/not-found.tsx`
- **Standardization**: Replaced ad-hoc layouts with the standardized 3-part header architecture:
  - Added standard `w-12 h-12 rounded-2xl` icon containers.
  - Implemented the `text-xs font-bold uppercase tracking-wider` context label.
  - Aligned page titles to `text-3xl font-bold tracking-tight`.

## Progressive UI & Layout Standardization (Session 105)

Standardized the primary dashboard home page and other utility pages to the established 3-part header architecture.

### Dashboard Home Header Standardization
- **File Updated**: `src/app/dashboard/page.tsx`
- **Standardization**: Refactored the dashboard home header to follow the 3-part visual hierarchy:
  - **Icon Container**: Added `Layout` icon in a `w-12 h-12 rounded-2xl bg-[var(--primary)]/10` container.
  - **Context Label**: Added "Workspace Overview" metadata label (`text-xs font-bold uppercase tracking-wider`).
  - **Main Title**: Ensured the title uses `text-3xl font-bold tracking-tight`.

### Billing Page Layout & Section Standardization
- **File Updated**: `src/app/billing/page.tsx`
- **Standardization**:
  - Replaced the custom sticky header with the standardized 3-part page header architecture (Icon Container: `CreditCard`, Context Label: "Account Subscription", Main Title: "Billing & Usage").
  - Standardized all sub-sections (Usage, Pricing Plans, Feature Comparison, Invoices) using the established section header architecture (Icon Container `w-10 h-10 rounded-xl` + Context Label + Title).
  - Refactored the Invoices list into a standardized `<Card className="overflow-hidden p-0">` with a padded flex header and `<Separator />`.
  - Replaced the floating back button with a consistent "Back to projects" link matching other configuration views.

### Edge Function Simulator Header Standardization
- **File Updated**: `src/app/edge-debug/page.tsx`
- **Standardization**: Refactored the Edge Function Simulator header to follow the 3-part architecture:
  - **Icon Container**: Updated `Cpu` icon container to the `w-12 h-12 rounded-2xl` standard.
  - **Context Label**: Added "Developer Tools" metadata label (`text-xs font-bold uppercase tracking-wider`).
  - **Main Title**: Ensured the title uses `text-3xl font-bold tracking-tight`.

### Project Import Header Standardization
- **File Updated**: `src/app/dashboard/new/import/page.tsx`
- **Standardization**: Refactored the Project Import configuration header to follow the 3-part architecture:
  - **Icon Container**: Updated `Settings` icon container to the `w-12 h-12 rounded-2xl` standard.
  - **Context Label**: Added "Project Import" metadata label (`text-xs font-bold uppercase tracking-wider`).
  - **Main Title**: Ensured the title uses `text-3xl font-bold tracking-tight`.
  - **Technical Metadata**: Added a right-aligned repository name indicator with `text-[10px] font-bold uppercase tracking-wider` labeling to match the Billing Page's current plan indicator.

### Repository Selection Header Standardization
- **File Updated**: `src/app/dashboard/new/page.tsx`
- **Standardization**: Refactored the Repository Selection header to follow the 3-part architecture:
  - **Icon Container**: Updated `Github` icon container to the `w-12 h-12 rounded-2xl` standard.
  - **Context Label**: Added "Git Connectivity" metadata label (`text-xs font-bold uppercase tracking-wider`).
  - **Main Title**: Standardized the title to "Import Repository" with `text-3xl font-bold tracking-tight`.

### Account & Team Settings Card Standardization
- **File Updated**: `src/app/dashboard/settings/page.tsx`
- **Standardization**:
  - Refactored "Personal Profile", "Invite New Member", and "Danger Zone" cards to follow the established internal section standard: `<Card className="overflow-hidden p-0">` with a padded flex header, `<Separator />`, and a padded content container.
  - Standardized section titles (e.g., from "Account Deletion" to "Critical Actions") to align with Project Settings naming conventions.

### Analytics Section Header Standardization
- **File Updated**: `src/app/dashboard/[id]/analytics/page.tsx`
- **Standardization**: Standardized "Deployment Performance" and "Traffic Analytics" headers to use the 3-part section header architecture (Icon Container `w-10 h-10 rounded-xl` + Context Label + Title).

### Settings Toggle Typography
- **File Updated**: `src/components/SettingsToggle.tsx`
- **Standardization**: Refined primary label typography from `text-base font-medium` to `text-sm font-semibold`. This improves legibility and matches the compact, professional design language used across other application components.

## Progressive UI & Layout Standardization (Session 106)

Continued ensuring environment consistency for local development and auditing.

### Environment & Audit Readiness
- **Improvement**: Bootstrapped `.env.local` with required placeholders for `MOCK_DB=true` mode and optimized `scripts/audit.ts` to skip live GCP checks when mocking is enabled. This ensures a "Green" audit state for local development environments.

## Progressive UI & Layout Standardization (Session 107)

Standardized the core authentication flow, project creation pipeline, and root-level system pages.

### Create Project Pipeline Standardization
- **File Updated**: `src/app/new/page.tsx`
- **Standardization**: Refactored the entire project creation flow to match dashboard standards:
  - **Layout**: Adopted the `max-w-7xl mx-auto px-6 md:px-8 py-8 space-y-10` root layout.
  - **Page Header**: Implemented the 3-part header architecture (Icon Container: `Rocket`, Context Label: "Project Creation", Main Title: "Create New Project").
  - **Stepper Component**: Standardized `StepIndicator` with `w-8 h-8` icon containers and improved `gap-3` spacing for a more professional feel.
  - **Card Standardization**: Refactored "Project Settings" and "Environment Variables" cards to the internal section standard: `<Card className="overflow-hidden p-0">` with padded headers, `<Separator />`, and padded content bodies.
  - **Technical Metadata**: Enforced `text-[10px] font-bold uppercase tracking-wider` for "Private" repo badges, environment variable targets/scopes, and build log filenames.
  - **Action Buttons**: Standardized primary deployment buttons to use `MovingBorderButton` with consistent `h-12` container sizing.

### Join Team Page Standardization
- **File Updated**: `src/app/join/page.tsx`
- **Standardization**:
  - Refactored the invite card and all error state cards to follow the 3-part header architecture (Icon Container + Context Label + Main Title).
  - Standardized the invite card using the `overflow-hidden p-0` pattern and established section headers.
  - Updated team avatars to use `rounded-2xl` to match the platform's standard icon container shape.
  - Enforced consistent spacing and typography across all conditional views.

### Root System Pages Standardization
- **Files Updated**: `src/app/error.tsx`, `src/app/not-found.tsx`
- **Standardization**:
  - Replaced ad-hoc system layouts with the standardized 3-part header architecture (Icon Container: `AlertCircle` for errors, `FileQuestion` for 404s).
  - Aligned context labels ("System Error", "404 Error") and typography to established dashboard standards.
  - Refactored full-page containers to use the standardized `<Card className="overflow-hidden p-0">` pattern with internal padding.
  - Unified technical metadata (Error Digests) to the `text-[10px] font-bold uppercase tracking-wider` standard.

### Authentication Flow Standardization
- **File Updated**: `src/app/(marketing)/login/page.tsx`
- **Standardization**:
  - Refactored the login card to follow the 3-part header architecture (Icon Container: `Rocket`, Context Label: "Authentication", Main Title: "Welcome back").
  - Standardized the login card using the `overflow-hidden p-0` pattern and `rounded-[2.5rem]` sizing.
  - Aligned technical labels (Secure OAuth) to the `text-[10px] font-bold uppercase tracking-wider` standard.

## Progressive UI & Layout Standardization (Session 108)

Standardized the deployment comparison and project overview pages to strictly adhere to the established architecture.

### Deployment Comparison Standardization
- **File Updated**: `src/app/dashboard/[id]/deployments/compare/page.tsx`
- **Standardization**:
  - Implemented the 3-part page header architecture (Icon Container: `ArrowLeftRight`, Context Label: "Performance Analysis", Main Title: "Compare Deployments").
  - Refactored base and target deployment selector cards to follow the internal section standard: `<Card className="overflow-hidden p-0">` with padded headers, `<Separator />`, and padded content bodies.
  - Standardized comparison results card with the 3-part internal section header (Icon Container `w-10 h-10` + Context Label + Title).
  - Enforced `text-[10px] font-bold uppercase tracking-wider` for all technical metadata (timestamps, environment types, SHAs, and status badges).
  - Removed arbitrary `pb-24` padding to align with the global root layout standard.

### Project Overview Standardization
- **File Updated**: `src/app/dashboard/[id]/page.tsx`
- **Standardization**:
  - Enforced the 3-part page header architecture (Icon Container: `Layout`, Context Label: "Project Overview", Main Title).
  - Refactored "Production Deployment", "Deployment History", and "Vitals" cards to follow the internal section standard: `<Card className="overflow-hidden p-0">` with padded headers, `<Separator />`, and padded content bodies where applicable.
  - Implemented the 3-part internal section header (Icon Container `w-10 h-10` + Context Label + Title) for all major overview cards.
  - Standardized all technical metadata (repository info, branch names, SHAs, and last push timestamps) to the `text-[10px] font-bold uppercase tracking-wider` standard.

### Component Typography Standardization
- **File Updated**: `src/components/DeploymentListItem.tsx`
- **Standardization**:
  - Enforced uppercase formatting for deployment timestamps.
  - Audited and confirmed all technical metadata (branches, SHAs, timestamps, and environment badges) uses the `text-[10px] font-bold uppercase tracking-wider` typography for cross-platform consistency.

## Progressive UI & Layout Standardization (Session 109)

Completed a comprehensive standardization pass for all core project settings components and the analytics dashboard.

### Settings Component Standardization
- **Files Updated**:
  - `src/components/EnvVariablesSection.tsx`
  - `src/components/DomainsSection.tsx`
  - `src/components/RegionSettings.tsx`
  - `src/components/ResourceSettings.tsx`
  - `src/components/BranchDeploymentsSettings.tsx`
  - `src/components/CronsSection.tsx`
- **Standardization**:
  - Refactored all configuration components to strictly adhere to the internal section standard: `<Card className="overflow-hidden p-0">` with a padded flex header (`p-6`), `<Separator />`, and padded content bodies (`p-6`).
  - Standardized all primary action buttons within these cards to use the `MovingBorderButton` with consistent `h-10 w-36` (or contextual) sizing.
  - Enforced `text-[10px] font-bold uppercase tracking-wider` for all secondary labels, group headers, table columns, and status indicators (e.g., "Ready", "Validating", "Saving...").

### Analytics Dashboard Refinement
- **File Updated**: `src/app/dashboard/[id]/analytics/page.tsx`
- **Standardization**:
  - Re-aligned the analytics page to the standardized 3-part page header architecture.
  - Refactored section headers for "Deployment Performance" and "Traffic Analytics" to use the 3-part internal section header (Icon Container + Context Label + Title) with proper spacing and `<Separator />` integration.
  - Ensured layout consistency when navigating between analytics and other project views.

### Log Viewer Typography Standardization
- **File Updated**: `src/components/LogViewer.tsx`
- **Standardization**:
  - Enforced `text-[10px] font-bold uppercase tracking-wider` and uppercase formatting for all technical log metadata, including timestamps, severity levels (INFO, WARNING, ERROR), and connection status badges.
  - Refined log line layout with improved spacing and fixed-width columns for timestamps and severities to ensure vertical alignment and developer-grade legibility.

## Progressive UI & Layout Standardization (Session 110)

Final pass on Project Settings and CLI robustness.

### Environment Variable & Cron Job UI Refinement
- **Files Updated**:
  - `src/components/EnvVariablesSection.tsx`
  - `src/components/CronsSection.tsx`
  - `src/app/dashboard/[id]/settings/page.tsx`
- **Standardization**:
  - Standardized all primary form labels (Key, Value, Path, Schedule, etc.) to `text-sm font-semibold`.
  - Enforced uppercase formatting for environment variable technical metadata (Target: BUILD/RUNTIME, Scope: ALL ENVS/PRODUCTION/PREVIEW).
  - Ensured consistent use of internal section headers (Icon + Context Label + Title) across all settings cards.

### CLI Usability & Feedback
- **File Updated**: `src/cli/index.js`
- **Improvement**:
  - Enhanced the `deploy` command with descriptive error feedback and actionable steps when a project is not linked.
  - Silenced Git error messages during background state checks to prevent user confusion when running the CLI outside of a repository.
