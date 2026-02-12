## 2026-01-31 - [Copy to Clipboard Feedback]
**Learning:** When implementing "Copy to Clipboard" visual feedback (e.g., changing an icon to a checkmark), it is critical to track the success state using a unique identifier (like an item ID) rather than the value itself. This prevents multiple items with the same value from showing the success state simultaneously.
**Action:** Always use unique IDs for local UI feedback states in list components.

## 2026-02-12 - [Accessible Form Patterns and Clearable Search]
**Learning:** This application frequently uses icons within form sections without semantic label associations, which impairs screen reader accessibility. Additionally, the search interaction lacks a quick way to reset state.
**Action:** Always wrap section titles in `<label htmlFor="...">` when they precede form elements, and implement a clear button (X icon) for all search inputs that appears only when text is present.

## 2026-02-14 - [Keyboard Shortcuts and Strict Linting]
**Learning:** Adding a keyboard shortcut (like Cmd+K) significantly improves power-user experience. However, implementing OS-detection via `navigator` in a `useEffect` can trigger cascading render warnings in strict environments if `setState` is called synchronously. Additionally, using `Math.random()` in render for "randomized" visual effects (like beams) violates component purity rules.
**Action:** Always defer OS-detection state updates using `setTimeout` or `requestAnimationFrame` to appease strict linters, and use pre-defined constants instead of `Math.random()` for visual variations.

## 2026-02-15 - [Accessible Tabbed Interfaces]
**Learning:** Custom tab switchers often lack the necessary ARIA semantics, making them unusable for screen reader users who cannot perceive the relationship between the trigger and the content panel.
**Action:** Always implement `role="tablist"`, `role="tab"`, and `role="tabpanel"` with appropriate `aria-selected`, `aria-controls`, and `aria-labelledby` attributes for any tab-based navigation.

## 2026-02-16 - [Vertical Flow and Compact Typography]
**Learning:** For SaaS landing pages where the process is key, a vertical timeline (using TracingBeam) is more intuitive than a horizontal tabbed interface as it naturally guides the eye downwards to the CTA. Additionally, over-sized elements can make a professional tool feel "huge" and less efficient; scaling down typography (e.g., to text-6xl for hero) and reducing padding creates a more high-end, scripe.io-like feel.
**Action:** Use TracingBeam for "The Method" section to create a cohesive narrative flow and maintain refined typography scales.

## 2026-02-18 - [Global Accessibility with Skip Links]
**Learning:** For content-heavy landing pages or authenticated apps, keyboard-only users often have to tab through numerous navigation links before reaching the main content. This is a common but easily fixed friction point.
**Action:** Always implement a "Skip to Content" link in the root layout (using `sr-only focus:not-sr-only` classes) that targets an `id="main-content"` on the primary `<main>` wrapper of every page.

## 2026-02-20 - [Narrative Flow and Interaction Feedback]
**Learning:** Adding numbered step labels (01, 02, etc.) to a vertical process section significantly improves the narrative flow and guides the user's eye. Additionally, combining icon-state changes with toast notifications for copy-to-clipboard actions provides redundant but highly effective feedback that confirms success even if the user isn't looking directly at the button.
**Action:** Use absolute-positioned numbers for process sections and always pair local state feedback with global toast notifications for critical interactions.

## 2026-02-22 - [Subtle Decorative Semantics and Expectation Management]
**Learning:** Purely decorative elements like pulse glows or stylistic step numbers (e.g., "01") can clutter the experience for screen reader users if not properly hidden. Additionally, providing immediate visual and textual feedback (via toasts) for inactive "Coming Soon" features prevents user frustration and manages expectations effectively.
**Action:** Always apply `aria-hidden="true"` to decorative stylistic markers and use informative toast notifications for mock features to acknowledge user interaction.

## 2026-02-23 - [Direct State Management vs. Effects]
**Learning:** Resetting a selection index in a search component via `useEffect` can trigger cascading render warnings in strict environments. Performing the reset directly in the `onChange` and "Clear" event handlers is more efficient, reduces render cycles, and avoids the need for `setTimeout` hacks.
**Action:** Prefer direct state updates within event handlers over `useEffect` for state that is dependent on user input.

## 2026-02-25 - [Monochromatic Brand Identity and Navigation UX]
**Learning:** To align with high-end monochromatic themes like scripe.io, transitioning UI accents from secondary colors to `white` or `neutral` tones creates a more refined, professional aesthetic. Additionally, users expect the brand logo to be a functional link back to the homepage; adding a subtle hover animation (e.g., rotation) provides clear feedback that the element is interactive and adds a touch of delight.
**Action:** Wrap brand logos in a `Link` to `/` and prioritize neutral tones for icons and badges in premium designs.
