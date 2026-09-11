import { config } from '@/lib/config';
import { checkServiceClaim } from '@/lib/gcp/service-claim';
import { generateServiceName, getProjectSlugForDeployment, sanitizeLabel } from '@/lib/utils';
import { listProjectIdsBySlug } from '@/lib/db';
import { getGcpAccessToken } from '@/lib/gcp/auth';
import type { Deployment, Project } from '@/types';

/**
 * Ownership guard for Cloud Run services in the shared GCP project.
 *
 * Every tenant's Cloud Run service lives in ONE GCP project (config.gcp.projectId)
 * under the untenanted name `dfy-<slug>`, and getProjectBySlug() only enforces slug
 * uniqueness within a single userId (src/lib/db.ts). So a service name is NOT proof
 * of ownership, and a prefix/wildcard listing is never safe to feed into deleteService().
 *
 * This module answers two questions:
 *   1. Which exact service names could THIS project have created?
 *   2. Of those, which are unambiguously ours to delete?
 *
 * Sibling of resource-ownership.ts, which does the same job for Cloud SQL / Memorystore.
 */

const CLOUD_RUN_API = 'https://run.googleapis.com/v2';

/** Cloud Run service names are lowercase alphanumerics and hyphens, nothing else. */
const CLOUD_RUN_NAME = /^dfy-[a-z0-9-]{1,59}$/;


export type ServiceOwnershipVia = 'mock' | 'disabled' | 'unique-slug' | 'gcp-label';

export interface SkippedService {
    name: string;
    reason: string;
}

export interface ServiceDeletionPlan {
    /** Exact service names proven to belong to this project. Safe to delete. */
    deletable: string[];
    /** Candidate names left alone because another tenant may own them. */
    skipped: SkippedService[];
    via: ServiceOwnershipVia;
}

/**
 * Every Cloud Run service name this project could have created, derived the same way
 * the deploy path derives it: generateServiceName(getProjectSlugForDeployment(...)).
 * See src/lib/gcp/cloudbuild.ts:136 and src/app/api/projects/[id]/deploy/route.ts:172.
 *
 * Pure + synchronous so it is unit-testable.
 */
export function resolveOwnedServiceNames(
    project: Pick<Project, 'slug'>,
    deployments: Pick<Deployment, 'type' | 'pullRequestNumber' | 'gitBranch'>[]
): string[] {
    const names = new Set<string>();

    // Production service.
    names.add(generateServiceName(project.slug));

    for (const deployment of deployments) {
        names.add(generateServiceName(getProjectSlugForDeployment(project, deployment)));

        // getPreviewServiceName() (cloudrun.ts:252) truncates at a slightly different
        // point than getProjectSlugForDeployment() for very long slugs. Claim both
        // spellings: a superset of EXACT names is still bounded, unlike a prefix.
        if (deployment.type === 'preview' && deployment.pullRequestNumber) {
            names.add(generateServiceName(`${project.slug}-pr-${deployment.pullRequestNumber}`));
        }
    }

    // Drop anything that is not a well-formed Cloud Run service name. This also stops a
    // malformed slug from being interpolated into a resource path.
    return [...names].filter((name) => CLOUD_RUN_NAME.test(name));
}

/** Reads the live deployify-project-id label off a Cloud Run service. Null when unknown. */
async function fetchServiceLabel(
    serviceName: string,
    region: string,
    accessToken: string
): Promise<string | null> {
    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const res = await fetch(
        `${CLOUD_RUN_API}/projects/${gcpProjectId}/locations/${region}/services/${serviceName}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.labels?.['deployify-project-id'] as string) || null;
}

/**
 * Decide which Cloud Run services this project's deletion is allowed to destroy.
 *
 * The check is Firestore-side, so it works for every service already running today —
 * no GCP label backfill required. A service name `dfy-X` is ours only if no OTHER
 * Deployify project claims slug X (or claims our own slug, from which our preview and
 * branch names are derived).
 *
 * CLOUD_RUN_OWNERSHIP_MODE=off is break-glass: it skips the contention check but still
 * only ever deletes exact derived names. It never restores the prefix wildcard.
 */
export async function planServiceDeletion(
    project: Pick<Project, 'id' | 'slug' | 'region'>,
    deployments: Pick<Deployment, 'type' | 'pullRequestNumber' | 'gitBranch'>[]
): Promise<ServiceDeletionPlan> {
    const candidates = resolveOwnedServiceNames(project, deployments);

    // Local dev: the mock Firestore ignores .where() and returns canned docs, so a
    // contention query there would always report a false collision.
    if (process.env.MOCK_DB === 'true') {
        return { deletable: candidates, skipped: [], via: 'mock' };
    }
    if (process.env.CLOUD_RUN_OWNERSHIP_MODE === 'off') {
        return { deletable: candidates, skipped: [], via: 'disabled' };
    }

    const deletable: string[] = [];
    const skipped: SkippedService[] = [];

    // Cache slug -> "claimed by someone else?" so N candidates cost at most N queries.
    const contested = new Map<string, boolean>();
    const isContested = async (slug: string): Promise<boolean> => {
        const cached = contested.get(slug);
        if (cached !== undefined) return cached;
        const claimants = await listProjectIdsBySlug(slug);
        const result = claimants.some((id) => id !== project.id);
        contested.set(slug, result);
        return result;
    };

    // If another project owns our slug, every derived name is ambiguous.
    const ownSlugContested = await isContested(project.slug);

    const region = project.region || config.gcp.region || process.env.GCP_REGION || 'asia-south1';

    for (const name of candidates) {
        const base = name.slice('dfy-'.length);

        // SECURITY: the slug-contention check below only compares PROJECT SLUGS, but the
        // Cloud Run namespace is strictly larger - preview services are `dfy-<slug>-pr-<n>`
        // and branch services `dfy-<slug>-<branch>`, and no project's slug equals those. A
        // project slugged `acme-pr-7` therefore looked UNCONTESTED while its production
        // service name collides with project `acme`'s PR-7 preview.
        //
        // So the ownership label is consulted for EVERY candidate, not just contested ones:
        // a label naming a different project is proof the service is not ours, whatever the
        // slug namespace says. Unlabelled services fall through to the contention logic,
        // which is the pre-existing behaviour for legacy resources.
        if (process.env.CLOUD_RUN_OWNERSHIP_LABEL_CHECK !== 'false') {
            try {
                const claim = await checkServiceClaim(name, project.id, await getGcpAccessToken(), region);
                if (!claim.allowed) {
                    skipped.push({ name, reason: 'owned-by-another-project' });
                    continue;
                }
            } catch (e) {
                console.warn(`[ServiceGuard] Ownership check failed for ${name}:`, e);
            }
        }

        const ambiguous = ownSlugContested || (base !== project.slug && (await isContested(base)));

        if (!ambiguous) {
            deletable.push(name);
            continue;
        }

        // Contested. A matching GCP label is positive proof the service is ours.
        // Only reached on collision, so the happy path makes zero extra GCP calls.
        if (process.env.CLOUD_RUN_OWNERSHIP_LABEL_CHECK !== 'false') {
            try {
                const accessToken = await getGcpAccessToken();
                const label = await fetchServiceLabel(name, region, accessToken);
                if (label && label === sanitizeLabel(project.id)) {
                    deletable.push(name);
                    continue;
                }
            } catch (e) {
                console.warn(`[ServiceGuard] Label lookup failed for ${name}:`, e);
            }
        }

        skipped.push({
            name,
            reason: `service name is also derivable by another Deployify project (slug "${base}")`,
        });
    }

    return { deletable, skipped, via: skipped.length === 0 ? 'unique-slug' : 'gcp-label' };
}
