## 2026-01-31 - [Copy to Clipboard Feedback]
**Learning:** When implementing "Copy to Clipboard" visual feedback (e.g., changing an icon to a checkmark), it is critical to track the success state using a unique identifier (like an item ID) rather than the value itself. This prevents multiple items with the same value from showing the success state simultaneously.
**Action:** Always use unique IDs for local UI feedback states in list components.

## 2026-02-12 - [Accessible Form Patterns and Clearable Search]
**Learning:** This application frequently uses icons within form sections without semantic label associations, which impairs screen reader accessibility. Additionally, the search interaction lacks a quick way to reset state.
**Action:** Always wrap section titles in `<label htmlFor="...">` when they precede form elements, and implement a clear button (X icon) for all search inputs that appears only when text is present.
