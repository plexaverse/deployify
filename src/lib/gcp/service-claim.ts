/**
 * Cloud Run service-name ownership preflight.
 *
 * Every tenant's services live in ONE shared GCP project, and the service name is a pure
 * function of tenant-supplied text:
 *   production : dfy-<slug>
 *   preview    : dfy-<slug>-pr-<n>
 *   branch     : dfy-<slug>-<branch>
 * all truncated to 59 characters by generateServiceName().
 *
 * The project-slug registry only makes *slugs* unique among *slugs*, which is a strictly
 * smaller namespace than the set of service names. Two consequences, both exploited in the
 * audit: a slug of `acme-pr-7` collides with project `acme`'s PR-7 preview service, and two
 * slugs differing only after character 59 collapse onto one service.
 *
 * `gcloud run deploy` is create-or-update, so colliding on a name overwrites another tenant's
 * running service. This module is the missing precondition: before deploying, confirm the
 * service either does not exist or already belongs to this Deployify project.
 */
import { getService } from '@/lib/gcp/cloudrun';

export const OWNERSHIP_LABEL = 'deployify-project-id';

export type ServiceClaimMode = 'enforce' | 'monitor' | 'off';

/**
 * enforce (default) — deny a deploy onto a service labelled for a different project.
 * monitor           — log the denial but proceed.
 * off               — skip the check entirely.
 *
 * An UNLABELLED existing service is always allowed through: services created before
 * ownership labels were stamped carry no label, and denying those would break every
 * legacy tenant's next deploy. Those are logged so the backfill can be tracked.
 */
export function getServiceClaimMode(): ServiceClaimMode {
    const raw = (process.env.CLOUD_RUN_SERVICE_CLAIM_MODE || '').toLowerCase();
    if (raw === 'off' || raw === 'monitor' || raw === 'enforce') return raw;
    return 'enforce';
}

export type ServiceClaim =
    | { allowed: true; reason: 'new' | 'owned' | 'unlabelled-legacy' | 'check-skipped' | 'check-failed' }
    | { allowed: false; reason: 'owned-by-other'; ownerProjectId: string };

/**
 * Decide whether `deployifyProjectId` may deploy onto `serviceName`.
 *
 * Fail-OPEN on transport errors: a Cloud Run API blip must not block every tenant's deploys.
 * The label mismatch itself is the only condition that denies.
 */
export async function checkServiceClaim(
    serviceName: string,
    deployifyProjectId: string | undefined,
    accessToken: string,
    region?: string | null
): Promise<ServiceClaim> {
    const mode = getServiceClaimMode();

    if (mode === 'off' || !deployifyProjectId || process.env.MOCK_DB === 'true') {
        return { allowed: true, reason: 'check-skipped' };
    }

    let service: Awaited<ReturnType<typeof getService>>;
    try {
        service = await getService(serviceName, accessToken, region);
    } catch (error) {
        console.error(`[ServiceClaim] Could not read ${serviceName}; allowing deploy (fail-open).`, error);
        return { allowed: true, reason: 'check-failed' };
    }

    if (!service) {
        return { allowed: true, reason: 'new' };
    }

    const labels = (service as { labels?: Record<string, string> }).labels || {};
    const owner = labels[OWNERSHIP_LABEL];

    if (!owner) {
        console.warn(
            `[ServiceClaim] ${serviceName} exists with no ${OWNERSHIP_LABEL} label; allowing deploy and stamping ownership. ` +
            `(project ${deployifyProjectId})`
        );
        return { allowed: true, reason: 'unlabelled-legacy' };
    }

    if (owner === deployifyProjectId) {
        return { allowed: true, reason: 'owned' };
    }

    console.error(
        `[ServiceClaim] BLOCKED: project ${deployifyProjectId} tried to deploy onto ${serviceName}, ` +
        `which is owned by project ${owner}. mode=${mode}`
    );

    if (mode === 'monitor') {
        return { allowed: true, reason: 'check-skipped' };
    }

    return { allowed: false, reason: 'owned-by-other', ownerProjectId: owner };
}

/** Human-readable refusal for API responses. Never leaks the other tenant's project id. */
export const SERVICE_CLAIM_ERROR =
    'This deployment target name is already in use by another Deployify project. Rename this project to continue.';
