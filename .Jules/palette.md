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
