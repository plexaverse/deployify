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