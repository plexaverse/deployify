## 2026-01-31 - [Copy to Clipboard Feedback]
**Learning:** When implementing "Copy to Clipboard" visual feedback (e.g., changing an icon to a checkmark), it is critical to track the success state using a unique identifier (like an item ID) rather than the value itself. This prevents multiple items with the same value from showing the success state simultaneously.
**Action:** Always use unique IDs for local UI feedback states in list components.
