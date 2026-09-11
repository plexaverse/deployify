/**
 * Backfill `metadata.resourceName` on storage connectors.
 *
 * WHY THIS IS NEEDED
 * Ownership of a GCP resource used to be derived from the connector's free-text display
 * name, which let a tenant claim another tenant's instance by naming a connector after it.
 * That fallback is gone: ownership now comes only from the SERVER-written
 * `metadata.resourceName`, and ~19 code paths refuse to act without it.
 *
 * `resourceName` has only ever been written when a connector was PROVISIONED
 * (`provision: true`). Connectors created by adopting an existing instance, or with a
 * bring-your-own connection string, have never had it. Until it is backfilled, those
 * connectors return 409 UNBOUND_RESOURCE from metrics, logs, guardrails, backups, export,
 * import, clone, query-insights, recommendations and the Data Lab BigQuery/Spanner paths.
 *
 * The sync route adopts lazily, but it is user-triggered and only handles
 * cloud-sql / memorystore. This script does the whole estate at once.
 *
 * SAFETY
 * Adoption is VERIFIED, never guessed. For each unbound connector it derives the candidate
 * name the old code would have used, then asks GCP who owns the resource:
 *   - label matches this project   -> adopt
 *   - no label at all              -> adopt (pre-labelling resource; reported separately)
 *   - label names another project  -> REFUSE, and report it loudly
 *   - lookup fails / no such API   -> skip
 *
 * USAGE
 *   npx tsx scripts/backfill-resource-names.ts            # dry run, writes nothing
 *   npx tsx scripts/backfill-resource-names.ts --apply    # writes
 *
 * Run the dry run first and read the CONFLICTS section. A conflict means two connectors
 * point at the same instance, which is exactly the cross-tenant condition the audit found.
 */
import fs from 'fs';
import path from 'path';

function loadEnv(filePath: string) {
    if (!fs.existsSync(filePath)) return;
    for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        const [, k, raw] = m;
        if (process.env[k] !== undefined) continue;
        process.env[k] = raw.replace(/^["']|["']$/g, '');
    }
}
loadEnv(path.resolve(process.cwd(), '.env.local'));

const APPLY = process.argv.includes('--apply');

async function main() {
    const { getDb, Collections } = await import('../src/lib/firebase');
    const { fetchDeployifyProjectLabel, resolveManagedResourceName, sanitizeLabel } =
        await import('../src/lib/gcp/resource-ownership');
    const { config } = await import('../src/lib/config');

    const db = getDb();
    const snapshot = await db.collection(Collections.PROJECTS).get();

    const adopted: string[] = [];
    const unlabelled: string[] = [];
    const conflicts: string[] = [];
    const skipped: string[] = [];
    // candidate name -> first project that claimed it, to catch two connectors on one instance
    const claimed = new Map<string, string>();

    console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — scanning ${snapshot.size} projects\n`);

    for (const doc of snapshot.docs) {
        const project = doc.data();
        const configs = project.storageConfigs || [];
        if (configs.length === 0) continue;

        let changed = false;

        for (const storage of configs) {
            if (resolveManagedResourceName(storage)) continue;      // already bound

            const label = `${project.id}/${storage.id} "${storage.name}" (${storage.type})`;
            const family = String(storage.type || '').includes('cloud-sql')
                ? 'cloud-sql'
                : storage.type === 'memorystore-redis'
                    ? 'memorystore-redis'
                    : storage.type === 'bigquery'
                        ? 'bigquery'
                        : storage.type === 'cloud-spanner'
                            ? 'cloud-spanner'
                            : null;

            if (!family) {
                skipped.push(`${label} — no label API for this type`);
                continue;
            }

            const candidate = String(storage.name || '').trim().toLowerCase().replace(/\s+/g, '-');
            if (!candidate || !/[a-z0-9]/.test(candidate)) {
                skipped.push(`${label} — name does not yield a usable resource id`);
                continue;
            }

            const gcpProjectId = storage.providerProjectId || config.gcp.projectId || process.env.GCP_PROJECT_ID;
            const region = storage.metadata?.region || project.region || null;

            let owner: string | null;
            try {
                owner = await fetchDeployifyProjectLabel(family, candidate, region, gcpProjectId!);
            } catch (e) {
                skipped.push(`${label} — lookup failed: ${e instanceof Error ? e.message : e}`);
                continue;
            }

            if (owner && owner !== sanitizeLabel(project.id)) {
                conflicts.push(`${label} — resource "${candidate}" is labelled for ${owner}. NOT adopted.`);
                continue;
            }

            const previous = claimed.get(`${gcpProjectId}:${candidate}`);
            if (previous && previous !== project.id) {
                conflicts.push(`${label} — resource "${candidate}" already claimed by project ${previous}. NOT adopted.`);
                continue;
            }
            claimed.set(`${gcpProjectId}:${candidate}`, project.id);

            (owner ? adopted : unlabelled).push(`${label} -> ${candidate}`);
            storage.metadata = { ...(storage.metadata || {}), resourceName: candidate };
            changed = true;
        }

        if (changed && APPLY) {
            await db.collection(Collections.PROJECTS).doc(doc.id).update({ storageConfigs: configs });
        }
    }

    const section = (title: string, rows: string[]) => {
        console.log(`\n=== ${title} (${rows.length}) ===`);
        rows.forEach(r => console.log('  ' + r));
    };

    section('ADOPTED — label already matched this project', adopted);
    section('ADOPTED — no label found (pre-labelling resource)', unlabelled);
    section('CONFLICTS — review these by hand', conflicts);
    section('SKIPPED', skipped);

    console.log(
        `\n${APPLY ? 'Wrote' : 'Would write'} ${adopted.length + unlabelled.length} resourceName value(s).` +
        (conflicts.length ? `\n${conflicts.length} CONFLICT(S) need a human — see above.` : '') +
        (APPLY ? '' : '\nRe-run with --apply to write.')
    );
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
