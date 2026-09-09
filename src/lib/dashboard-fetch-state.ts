// Dashboard project-list fetch classification (defect product-ux-2).
//
// src/app/dashboard/page.tsx did `setProjects(data.projects || [])` without ever
// looking at `response.ok`. Every non-2xx from GET /api/projects answers with a JSON
// body that has no `projects` key ({ error: '...' }), so a 401 after the 7-day session
// JWT expires, a 403 on a team the user was just removed from, and a 500 from a
// Firestore blip all collapsed into an empty array and rendered <OnboardingGuide/> -
// "Welcome to Deployify - Connect GitHub" - to a tenant with live projects. A 502/503
// HTML error page from the load balancer took the same path via the catch block.
//
// The decision is a pure function so it is unit-testable under `node --test` and so a
// rollback is one env var rather than a code change.
//
// Mirrors the UI_LEGIBILITY_MODE / CSRF_ORIGIN_MODE staged-flag convention.
//   legacy - today's behaviour exactly: `data.projects || []`, status ignored, a
//            transport failure only logs. No error state ever appears.
//   strict - non-2xx responses, malformed bodies and transport failures become an
//            error state, so the first-run onboarding screen is never shown to an
//            account whose project list simply failed to load. Default.

export type ProjectsErrorUiMode = 'legacy' | 'strict';

export type ProjectsFetchErrorReason =
    | 'unauthenticated'
    | 'forbidden'
    | 'server'
    | 'network'
    | 'malformed';

export type ProjectsFetchOutcome<T> =
    | { kind: 'ok'; projects: T[] }
    | { kind: 'error'; reason: ProjectsFetchErrorReason; status: number | null };

/**
 * `legacy` restores today's behaviour. Anything else - including unset - is `strict`.
 *
 * Read as a plain member expression so Next inlines it into the client bundle at
 * build time, the same way `config.ts` reads NEXT_PUBLIC_APP_URL.
 */
export function resolveProjectsErrorUiMode(
    raw: string | undefined = process.env.NEXT_PUBLIC_DASHBOARD_ERROR_UI
): ProjectsErrorUiMode {
    return (raw ?? '').trim().toLowerCase() === 'legacy' ? 'legacy' : 'strict';
}

function readProjectsArray<T>(body: unknown): T[] | null {
    if (body === null || typeof body !== 'object') return null;
    const value = (body as { projects?: unknown }).projects;
    return Array.isArray(value) ? (value as T[]) : null;
}

function reasonForStatus(status: number): ProjectsFetchErrorReason {
    if (status === 401) return 'unauthenticated';
    if (status === 403) return 'forbidden';
    return 'server';
}

/**
 * Classify a completed fetch of GET /api/projects.
 *
 * `body` is the already-parsed JSON. A 2xx carrying a `projects` array is the only
 * shape that yields `ok`, which is exactly the shape the route returns on success -
 * including the genuine first-run case, `{ success: true, projects: [] }`.
 */
export function classifyProjectsResponse<T>(
    input: { ok: boolean; status: number; body: unknown },
    mode: ProjectsErrorUiMode = resolveProjectsErrorUiMode()
): ProjectsFetchOutcome<T> {
    if (mode === 'legacy') {
        // Reproduces `const data = await response.json(); data.projects || []`.
        const raw = (input.body as { projects?: T[] } | null | undefined)?.projects;
        return { kind: 'ok', projects: raw || [] };
    }

    if (!input.ok) {
        return { kind: 'error', reason: reasonForStatus(input.status), status: input.status };
    }

    const projects = readProjectsArray<T>(input.body);
    if (projects === null) {
        return { kind: 'error', reason: 'malformed', status: input.status };
    }

    return { kind: 'ok', projects };
}

/**
 * Classify a fetch that never produced a parseable response - a dropped connection,
 * or the HTML error page a load balancer returns for a 502/503.
 *
 * Returns null in legacy mode, meaning "do what today does": log and leave the
 * existing state untouched.
 */
export function classifyProjectsTransportFailure(
    mode: ProjectsErrorUiMode = resolveProjectsErrorUiMode()
): ProjectsFetchOutcome<never> | null {
    if (mode === 'legacy') return null;
    return { kind: 'error', reason: 'network', status: null };
}

export interface ProjectsErrorCopy {
    title: string;
    description: string;
    /** True when the remedy is signing in again rather than retrying. */
    requiresSignIn: boolean;
}

export function projectsErrorCopy(reason: ProjectsFetchErrorReason): ProjectsErrorCopy {
    switch (reason) {
        case 'unauthenticated':
            return {
                title: 'Your session expired',
                description: 'Sign in again to see your projects. Nothing has been deleted.',
                requiresSignIn: true,
            };
        case 'forbidden':
            return {
                title: "You don't have access to this workspace",
                description: 'Your access to this team may have changed. Switch workspace or ask an owner to re-invite you.',
                requiresSignIn: false,
            };
        case 'network':
            return {
                title: "Couldn't reach Deployify",
                description: 'The connection dropped while loading your projects. Your projects and deployments are unaffected.',
                requiresSignIn: false,
            };
        case 'malformed':
        case 'server':
        default:
            return {
                title: "Couldn't load your projects",
                description: 'Something went wrong on our side. Your projects and deployments are still running.',
                requiresSignIn: false,
            };
    }
}
