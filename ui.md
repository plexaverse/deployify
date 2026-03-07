[... existing content of ui.md based on output from cat ui.md]
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

### Settings Toggle Typography
- **File Updated**: `src/components/SettingsToggle.tsx`
- **Standardization**: Refined primary label typography from `text-base font-medium` to `text-sm font-semibold`. This improves legibility and matches the compact, professional design language used across other application components.