import { toast } from 'sonner';
import {
    describeActionResult,
    type ActionResult,
    type ActionToastCopy,
} from '@/lib/action-feedback';

/**
 * Resolve an existing `toast.loading(...)` id with the truth about an ActionResult.
 * Kept out of src/lib/action-feedback.ts so that module stays importable by node --test.
 */
export function toastActionResult(
    toastId: string | number,
    result: ActionResult,
    copy: ActionToastCopy
): void {
    const feedback = describeActionResult(result, copy);
    switch (feedback.kind) {
        case 'error':
            toast.error(feedback.text, { id: toastId });
            return;
        case 'warning':
            toast.warning(feedback.text, { id: toastId });
            return;
        default:
            toast.success(feedback.text, { id: toastId });
    }
}
