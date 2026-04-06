## 2026-03-22 - [Scripe.io Aesthetic and Compact Interactivity]
**Learning:** Achieving a "premium" scripe.io aesthetic requires attention to micro-typography (e.g., `tracking-[0.2em]`) and glass-morphism (`backdrop-blur`). When implementing interactive elements (like copy buttons) within a parent navigation link, the `e.stopPropagation()` and `e.preventDefault()` patterns are essential. Additionally, avoiding `useEffect` for deterministic UI state (like mock sparklines) prevents cascading render warnings in strict environments.
**Action:** Use wider tracking for metadata labels and prefer `useMemo` for deterministic visual data to satisfy strict linter rules.

## 2026-03-25 - [Framer Motion Filter Syntax and Build Safety]
**Learning:** When using Framer Motion's `whileHover` or `animate` props to apply complex visual effects like drop shadows alongside grayscale, it is safer to use the full `filter` string property (e.g., `filter: 'grayscale(0%) drop-shadow(...)'`) rather than attempting to use shorthand keys like `dropShadow`. TypeScript often lacks definitions for these shorthands in the motion target types, leading to build-time failures even if they work in development.
**Action:** Always use the composite `filter` string for complex CSS filters in Framer Motion to ensure build stability.

## 2026-03-27 - [Consistent Theme Redesign and Micro-UX Targets]
**Learning:** A theme redesign (e.g., scripe.io) requires systemic updates to foundational components like `Button` (rounding) and `Badge`/`BentoGridItem` (typography tracking) to ensure a cohesive "premium" feel across the app. Additionally, making entire informational blocks (like CLI snippets) clickable for copy actions significantly improves the "Micro-UX" by providing larger, more intuitive interaction targets.
**Action:** Prioritize foundational component updates for theme shifts and use block-level click targets for frequently copied data.
