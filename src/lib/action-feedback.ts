/**
 * Truthful client feedback for fire-and-forget dashboard actions.
 *
 * `redeployProject` and `cancelDeployment` (src/store/project-slice.ts) used to return
 * `Promise<void>` and swallow every non-2xx response: no `else` branch, no error state,
 * not even a `console.error` (their `catch` only sees network failures). Their callers
 *
 *   - src/app/dashboard/[id]/page.tsx            handleRedeploy / handleCancel
 *   - src/app/dashboard/[id]/deployments/page.tsx handleCancel
 *
 * therefore resolved a `toast.loading(...)` into an unconditional `toast.success(...)`.
 * A Free-plan tenant at their monthly deployment cap gets 403
 * `{ error: 'Usage limit exceeded: deployments. Please upgrade your plan.' }` from
 * /api/projects/[id]/deploy and still sees a green "Deployment triggered". Same for a
 * `viewer` (403), a slug-squat block (403), a failed repo validation (400) and
 * "Cannot cancel completed deployment" (400).
 *
 * This module is deliberately dependency-free (no sonner, no react, no server imports) so
 * it can be unit-tested under `node --test` like the rest of src/lib. The sonner call
 * lives in src/lib/action-toast.ts.
 *
 * Rollout is behind NEXT_PUBLIC_DEPLOY_ACTION_FEEDBACK:
 *
 *   'accurate' - DEFAULT. Failures render `toast.error(<server error>)`.
 *   'legacy'   - pre-fix behaviour, bit for bit: always `toast.success(copy.success)`.
 *
 * NOTE: NEXT_PUBLIC_* is inlined by Next at BUILD time, so 'legacy' is a build-env
 * escape hatch, not a hot kill switch. It is here so the first release can ship dark if
 * the product owner wants it; it cannot be flipped without a redeploy either way.
 */

export type DeployActionFeedbackMode = 'legacy' | 'accurate';

/** Normalised outcome of a mutating dashboard fetch. */
export interface ActionResult {
    ok: boolean;
    /** HTTP status, or 0 when the request never reached the server. */
    status: number;
    /** User-facing failure text. Only set when ok === false. */
    error?: string;
    /** Informational text taken from a 2xx body (e.g. the supersede notice). */
    message?: string;
    /** The API accepted the call but did no work (201 + a deployment already cancelled). */
    noop?: boolean;
}

export interface ActionToastCopy {
    /** Exactly the string the page shows today on success. */
    success: string;
    /** Used only when the server sent no usable error text. */
    failure: string;
}

export interface ActionFeedback {
    kind: 'success' | 'error' | 'warning';
    text: string;
}

export function resolveDeployActionFeedbackMode(raw: string | undefined): DeployActionFeedbackMode {
    return raw === 'legacy' ? 'legacy' : 'accurate';
}

/** Read once at module load so Next can inline the literal into the client bundle. */
export const DEPLOY_ACTION_FEEDBACK_MODE: DeployActionFeedbackMode =
    resolveDeployActionFeedbackMode(process.env.NEXT_PUBLIC_DEPLOY_ACTION_FEEDBACK);

function readString(body: unknown, key: string): string | undefined {
    if (!body || typeof body !== 'object') return undefined;
    const value = (body as Record<string, unknown>)[key];
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

/**
 * `response.json()` throws on an empty body or on an HTML error page from the LB.
 * Never let that turn a clean 403 into a network-error toast.
 */
export async function readJsonBody(response: { json: () => Promise<unknown> }): Promise<unknown> {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

export function toActionResult(
    status: number,
    ok: boolean,
    body: unknown,
    fallbackError: string
): ActionResult {
    if (!ok) {
        return {
            ok: false,
            status,
            // Every failing handler in the deploy route replies { error: string }.
            // `message` is the secondary field on the Cloud Build 500.
            error: readString(body, 'error') || readString(body, 'message') || fallbackError,
        };
    }

    const result: ActionResult = { ok: true, status };
    const message = readString(body, 'message');
    if (message) result.message = message;

    // DEPLOY_CONCURRENCY_MODE=supersede answers 201 with an already-cancelled deployment
    // (src/app/api/projects/[id]/deploy/route.ts). Nothing was queued, so "Deployment
    // triggered" would be a second lie. Unreachable while the mode is 'off' (today).
    const deployment = (body && typeof body === 'object')
        ? (body as { deployment?: { status?: unknown } }).deployment
        : undefined;
    if (deployment && deployment.status === 'cancelled') result.noop = true;

    return result;
}

export function describeActionResult(
    result: ActionResult,
    copy: ActionToastCopy,
    mode: DeployActionFeedbackMode = DEPLOY_ACTION_FEEDBACK_MODE
): ActionFeedback {
    if (mode === 'legacy') return { kind: 'success', text: copy.success };
    if (!result.ok) return { kind: 'error', text: result.error || copy.failure };
    if (result.noop) return { kind: 'warning', text: result.message || copy.success };
    return { kind: 'success', text: copy.success };
}
