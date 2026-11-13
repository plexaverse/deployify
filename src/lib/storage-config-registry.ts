/**
 * Race-safe writes to `projects/<id>.storageConfigs`.
 *
 * Every storage route reads the whole `storageConfigs` array out of a plain document read
 * (`checkProjectAccess` -> `getProjectById`, a bare `.get()`) and writes the whole array
 * back with `updateProject()`, which is a bare `.update()` with no precondition
 * (src/lib/db.ts:1315-1321). That is a read-modify-write, and the replica route holds the
 * array across `createReadReplica()` - a Cloud SQL API call.
 *
 * Two admins clicking "Create replica" in that window both read an array without the
 * other's replica, and the second `.update()` wins. One replica row is lost while the
 * Cloud SQL instance it described keeps running and keeps billing, and it cannot be
 * removed through the UI because DELETE looks the replica up in the same array.
 *
 * `mutateStorageConfigs()` re-reads the array INSIDE a Firestore transaction and applies
 * the caller's mutation to that fresh copy, so concurrent writers serialise instead of
 * clobbering each other.
 *
 * Rollout is behind STORAGE_CONFIG_WRITE_MODE and DEFAULTS TO TODAY'S BEHAVIOUR:
 *
 *   'legacy'        - DEFAULT. Kill switch. `mutateStorageConfigs()` reads nothing and
 *                     writes nothing; the caller runs the pre-fix write unchanged.
 *                     Forced on when MOCK_DB=true.
 *   'transactional' - read-modify-write inside a transaction. If the transaction cannot
 *                     commit, the caller is told to run the legacy write anyway, so a
 *                     Firestore hiccup never turns a 200 into a 500 and never strands a
 *                     GCP resource that has already been created.
 *
 * Additive only: no new collection, no new field, no composite index, no schema change.
 * Documents written by the legacy path are read back unchanged, and nested Firestore
 * Timestamps inside `storageConfigs` round-trip exactly as they do today.
 */
import { getDb, Collections } from '@/lib/firebase';
import { cleanFirestoreData } from '@/lib/utils';
import type { StorageConfig } from '@/types';

export type StorageConfigWriteMode = 'legacy' | 'transactional';

/**
 * 'written' - the transaction committed; the caller must NOT write again.
 * 'noop'    - the transaction ran and decided there was nothing to write (the connector
 *             or the replica was already gone, or the mutation was already applied).
 *             The caller must NOT write again.
 * 'legacy'  - the caller must perform its own pre-fix write. Returned for the kill switch,
 *             for MOCK_DB, and for a transaction that could not commit.
 */
export type StorageConfigWriteOutcome = 'written' | 'noop' | 'legacy';

export function getStorageConfigWriteMode(): StorageConfigWriteMode {
    // The mock Firestore's runTransaction hands the callback a canned document that ignores
    // the ref it is given, so a transaction there would read the fixture instead of the
    // project. Local dev / audit runs keep exactly today's code path.
    if (process.env.MOCK_DB === 'true') return 'legacy';

    const raw = (process.env.STORAGE_CONFIG_WRITE_MODE || '').trim().toLowerCase();
    return raw === 'transactional' ? 'transactional' : 'legacy';
}

/**
 * Apply `mutate` to the CURRENT `storageConfigs` array under a Firestore transaction.
 *
 * `mutate` receives the array as it exists in Firestore at commit time and returns the
 * replacement array, or `null` to skip the write. It must be pure and cheap: a transaction
 * callback can be retried, so never put a GCP call or an audit write inside it.
 */
export async function mutateStorageConfigs(
    projectId: string,
    mutate: (configs: StorageConfig[]) => StorageConfig[] | null,
    context: string
): Promise<StorageConfigWriteOutcome> {
    if (getStorageConfigWriteMode() === 'legacy') return 'legacy';

    const db = getDb();
    const ref = db.collection(Collections.PROJECTS).doc(projectId);

    try {
        return await db.runTransaction<StorageConfigWriteOutcome>(async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists) {
                // Same end state as today: updateProject() on a missing doc throws and the
                // route's catch turns it into a 500.
                throw new Error(`Project ${projectId} not found`);
            }

            const current = (snap.data()?.storageConfigs || []) as StorageConfig[];
            const next = mutate(current);
            if (!next) return 'noop';

            tx.update(ref, cleanFirestoreData({
                storageConfigs: next,
                updatedAt: new Date(),
            }));
            return 'written';
        });
    } catch (error) {
        // Never let our own bookkeeping strand a paid GCP resource. Fall back to the
        // pre-fix write, which is exactly what would have run before this module existed.
        console.error(
            `[StorageConfigs] Transactional write failed for project=${projectId} ` +
            `context=${context}; falling back to the legacy write`,
            error
        );
        return 'legacy';
    }
}

/**
 * Pure. Append `replica` to connector `storageId`'s `metadata.replicas`.
 * Returns null when the connector is gone or the replica id is already recorded, so a
 * retried transaction cannot record the same replica twice.
 */
export function addReplicaToConfigs(
    configs: StorageConfig[],
    storageId: string,
    replica: { id: string } & Record<string, unknown>
): StorageConfig[] | null {
    const index = configs.findIndex((s) => s.id === storageId);
    if (index === -1) return null;

    const target = configs[index];
    const replicas = (target.metadata?.replicas as Array<{ id?: string }>) || [];
    if (replicas.some((r) => r && r.id === replica.id)) return null;

    const next = [...configs];
    next[index] = {
        ...target,
        metadata: {
            ...target.metadata,
            replicas: [...replicas, replica],
        },
    };
    return next;
}

/**
 * Pure. Drop replica `replicaId` from connector `storageId`'s `metadata.replicas`.
 * Returns null when the connector is gone or the replica is already absent.
 */
export function removeReplicaFromConfigs(
    configs: StorageConfig[],
    storageId: string,
    replicaId: string
): StorageConfig[] | null {
    const index = configs.findIndex((s) => s.id === storageId);
    if (index === -1) return null;

    const target = configs[index];
    const replicas = (target.metadata?.replicas as Array<{ id?: string }>) || [];
    if (!replicas.some((r) => r && r.id === replicaId)) return null;

    const next = [...configs];
    next[index] = {
        ...target,
        metadata: {
            ...target.metadata,
            replicas: replicas.filter((r) => !r || r.id !== replicaId),
        },
    };
    return next;
}
