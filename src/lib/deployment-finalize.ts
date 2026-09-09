/**
 * Exactly-once finalization for a deployment row (defect reliability-races-2).
 *
 * syncDeploymentStatus() is a check-then-act: it reads the row, returns early when the
 * status is already terminal, and then spends ~1-3 s in sequential GCP calls
 * (getBuildStatus -> getCloudRunServiceUrl -> getGcpProjectNumber -> getService) before it
 * writes the terminal status. Three independent pollers sit inside that window on the
 * normal happy path:
 *
 *   - src/components/DeploymentLogsModal.tsx           every 3 s  -> .../deployments/[deployId]/logs
 *   - src/app/dashboard/[id]/deployments/page.tsx      every 5 s  -> .../[id]/deployments
 *   - pollBuildStatus() in src/lib/deployment.ts       every 30 s -> in-process
 *   (src/app/dashboard/[id]/page.tsx polls GET /api/projects/[id], a fourth entry point.)
 *
 * All of them can observe `building`, all of them proceed, and every side effect that sits
 * AFTER the terminal write then runs once per poller: trackDeployment()'s
 * FieldValue.increment (over-billed deployments + build minutes), sendEmail(),
 * createPRComment(), createDeploymentStatus(), updateProject(), pruneProjectImages(),
 * runLighthouseAudit() and ensureEphemeralDatabase().
 *
 * In every one of the three branches that finalize a row (timeout, SUCCESS, FAILURE) the
 * terminal updateDeployment() is the FIRST write and every side effect comes after it. So a
 * single compare-and-set on that one write gates all of them: whoever flips the row from a
 * non-terminal to a terminal status wins and runs the side effects; everybody else returns
 * the finalized row and does nothing. Firestore transactions are serializable with
 * automatic retry, so of N concurrent finalizers exactly one gets `won: true`.
 *
 * No lease, no TTL, no new document, no new index. The compare-and-set is on the EXISTING
 * `status` field, so no schema change and no migration: a row written years ago behaves
 * identically to one written a second ago.
 *
 * Rollout is behind DEPLOYMENT_FINALIZE_MODE and DEFAULTS TO TODAY'S BEHAVIOUR:
 *
 *   'off'   - DEFAULT. Kill switch. Plain updateDeployment(), no transaction, not one extra
 *             Firestore read. Byte-identical to today.
 *   'audit' - one extra non-transactional read before the write, purely to log how often a
 *             row is already terminal when a poller is about to finalize it. Still writes
 *             and still runs every side effect exactly as today. The count is a LOWER bound
 *             (the read is itself racy); use it to size the blast radius on live tenants.
 *   'guard' - the compare-and-set. Side effects run for the winner only.
 *
 * Every failure path is fail-OPEN: if the transaction itself throws, we fall back to the
 * plain write and report `won: true`, because a Firestore hiccup must never strand a paying
 * tenant's deployment at `building`. Worst case we are back to today's behaviour for that
 * one poll.
 */
import { Collections, getDb } from '@/lib/firebase';
import { updateDeployment, getDeploymentById } from '@/lib/db';
import { cleanFirestoreData } from '@/lib/utils';
import type { Deployment, DeploymentStatus } from '@/types';

export type DeploymentFinalizeMode = 'off' | 'audit' | 'guard';

/** A row in one of these states is finished; nothing may finalize it a second time. */
export const TERMINAL_DEPLOYMENT_STATUSES: ReadonlySet<DeploymentStatus> = new Set<DeploymentStatus>([
    'ready',
    'error',
    'cancelled',
]);

/** Mirrors the early-return test at the top of syncDeploymentStatus(). */
export function isTerminalDeploymentStatus(status: unknown): boolean {
    return TERMINAL_DEPLOYMENT_STATUSES.has(status as DeploymentStatus);
}

export function getDeploymentFinalizeMode(): DeploymentFinalizeMode {
    // The mock Firestore's runTransaction() hands the callback a canned document whose
    // status is always 'ready', so a compare-and-set there would suppress every side
    // effect. Local dev / `npm run audit` keep exactly today's code path. (Local dev does
    // not reach this code anyway - it runs simulateDeployment(), which has no build id.)
    if (process.env.MOCK_DB === 'true') return 'off';

    const raw = (process.env.DEPLOYMENT_FINALIZE_MODE || '').trim().toLowerCase();
    if (raw === 'audit' || raw === 'guard') return raw;
    return 'off';
}

export interface FinalizeOutcome {
    /** True when THIS caller moved the row to a terminal status and owns the side effects. */
    won: boolean;
    mode: DeploymentFinalizeMode;
    /** The terminal status another finalizer had already written. Only set when `won` is false. */
    observedStatus?: DeploymentStatus;
}

/**
 * Move a deployment to a terminal status, at most once across every concurrent poller.
 *
 * Returns `{ won: true }` when the caller must go on to run the notification / billing /
 * GitHub side effects, and `{ won: false }` when another finalizer already did.
 *
 * `updates.status` MUST be terminal - this is the finalizing write, not the
 * queued -> building -> deploying progress write, which stays a plain updateDeployment().
 */
export async function finalizeDeploymentOnce(
    deploymentId: string,
    updates: Partial<Deployment> & { status: DeploymentStatus }
): Promise<FinalizeOutcome> {
    const mode = getDeploymentFinalizeMode();

    if (mode !== 'guard') {
        // ---- Legacy path: byte-for-byte the pre-fix write. Kill switch / MOCK_DB. ----
        if (mode === 'audit') {
            try {
                const current = await getDeploymentById(deploymentId);
                if (current && isTerminalDeploymentStatus(current.status)) {
                    console.warn(
                        `[DeploymentFinalize] audit: deployment=${deploymentId} is already ` +
                        `${current.status} while this poller is about to write ${updates.status}; ` +
                        `guard mode would have suppressed the duplicate usage increment, email ` +
                        `and PR comment`
                    );
                }
            } catch (e) {
                console.error(`[DeploymentFinalize] audit read failed for ${deploymentId}:`, e);
            }
        }
        await updateDeployment(deploymentId, updates);
        return { won: true, mode };
    }

    try {
        const db = getDb();
        const ref = db.collection(Collections.DEPLOYMENTS).doc(deploymentId);
        let observedStatus: DeploymentStatus | undefined;

        const won = await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            // A row that vanished mid-build has nothing to finalize and no side effects to
            // run. updateDeployment() would have thrown NOT_FOUND here.
            if (!snap.exists) return false;

            const status = snap.data()?.status as DeploymentStatus | undefined;
            if (isTerminalDeploymentStatus(status)) {
                observedStatus = status;
                return false;
            }

            // Same payload updateDeployment() writes, including the updatedAt stamp and the
            // undefined-stripping Firestore rejects without.
            tx.update(ref, cleanFirestoreData({ ...updates, updatedAt: new Date() }));
            return true;
        });

        if (!won) {
            console.warn(
                `[DeploymentFinalize] deployment=${deploymentId} was already finalized as ` +
                `${observedStatus ?? 'missing'}; skipping duplicate side effects for ${updates.status}`
            );
        }

        return { won, mode, observedStatus };
    } catch (e) {
        // Fail open, same tolerance as src/lib/deploy-concurrency.ts: never leave a tenant's
        // deployment stuck at `building` because a transaction failed.
        console.error(
            `[DeploymentFinalize] transaction failed for ${deploymentId}; falling back to the ` +
            `unguarded write:`,
            e
        );
        await updateDeployment(deploymentId, updates);
        return { won: true, mode };
    }
}
