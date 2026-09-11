import { getGcpAccessToken } from './auth';


const CRM_API = 'https://cloudresourcemanager.googleapis.com/v1';

/**
 * Canonical set of project-level roles Deployify treats as "excessive" on the shared
 * platform service account. This is the ONLY set automated remediation may ever revoke.
 * `checkLeastPrivilege()` -- the sole legitimate producer of
 * `storage.metadata.excessiveRoles` -- can only ever emit a subset of this list, so
 * filtering against it is a no-op for every honestly-written Firestore document.
 */
export const EXCESSIVE_PROJECT_ROLES: readonly string[] = [
    'roles/owner',
    'roles/editor',
    'roles/resourcemanager.projectIamAdmin',
    'roles/secretmanager.secretAccessor',
    'roles/secretmanager.admin'
];

/** Pre-existing fallback when a connector has no recorded excessiveRoles. Unchanged. */
const DEFAULT_REVOCABLE_ROLES: readonly string[] = ['roles/owner', 'roles/editor'];

/**
 * Roles that must never be revoked automatically: stripping them from the shared platform
 * service account destroys Deployify's own ability to write IAM and cannot be repaired from
 * inside the product. Set IAM_ALLOW_SELF_LOCKOUT_REVOKE=true to restore the old behaviour.
 */
const SELF_LOCKOUT_ROLES: readonly string[] = [
    'roles/resourcemanager.projectIamAdmin',
    // These four are shared-fate: the platform service account needs them to deploy, read
    // secrets and manage Cloud SQL for EVERY tenant. Automated remediation stripping any of
    // them takes the whole platform down, which is the DoS ai-cost-abuse-1 described. They
    // stay in EXCESSIVE_PROJECT_ROLES so the auditor still REPORTS them as over-privileged;
    // they are simply not auto-revocable. Removing them is an operator decision.
    'roles/owner',
    'roles/editor',
    'roles/secretmanager.admin',
    'roles/secretmanager.secretAccessor'
];

/**
 * Narrows a (tenant-writable) list of roles down to the ones automated remediation is
 * permitted to revoke from the shared platform service account.
 *
 * Semantics deliberately mirror the previous `(metadata?.excessiveRoles as string[]) || [...]`
 * expression: only a *falsy* value falls back to the owner/editor default, so an explicit
 * empty array still means "revoke nothing".
 */
export function resolveRevocableRoles(requested: unknown): { roles: string[]; rejected: string[] } {
    const raw: unknown = requested ? requested : DEFAULT_REVOCABLE_ROLES;
    const candidates: unknown[] = Array.isArray(raw) ? raw : [];

    const extra = (process.env.IAM_REMEDIATION_EXTRA_REVOCABLE_ROLES || '')
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean);
    const allowlist = new Set<string>([...EXCESSIVE_PROJECT_ROLES, ...extra]);
    const allowSelfLockout = process.env.IAM_ALLOW_SELF_LOCKOUT_REVOKE === 'true';

    const roles: string[] = [];
    const rejected: string[] = [];

    for (const candidate of candidates) {
        if (typeof candidate !== 'string') {
            rejected.push(String(candidate));
            continue;
        }
        const role = candidate.trim();
        if (!allowlist.has(role) || (!allowSelfLockout && SELF_LOCKOUT_ROLES.includes(role))) {
            rejected.push(role);
            continue;
        }
        if (!roles.includes(role)) {
            roles.push(role);
        }
    }

    return { roles, rejected };
}

/**
 * Fetches the current IAM policy for a project
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getProjectIamPolicy(projectId: string): Promise<any> {
    if (process.env.MOCK_DB === 'true') {
        return {
            bindings: [
                { role: 'roles/owner', members: ['user:admin@deployify.co'] },
                { role: 'roles/editor', members: ['serviceAccount:deployify-sa@mock.iam.gserviceaccount.com'] }
            ]
        };
    }

    const accessToken = await getGcpAccessToken();
    const res = await fetch(`${CRM_API}/projects/${projectId}:getIamPolicy`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
    });

    if (!res.ok) {
        throw new Error(`Failed to get IAM policy: ${await res.text()}`);
    }

    return res.json();
}

/**
 * Revoke a role from a service account at the project level
 */
export async function revokeProjectRole(
    projectId: string,
    member: string,
    role: string
): Promise<boolean> {
    if (process.env.MOCK_DB === 'true') {
        console.log(`[IAM] MOCK: Revoking ${role} from ${member} in ${projectId}`);
        return true;
    }

    try {
        const policy = await getProjectIamPolicy(projectId);
        const memberName = member.startsWith('serviceAccount:') ? member : `serviceAccount:${member}`;
        const accessToken = await getGcpAccessToken();

        // Update policy
        let roleFound = false;
        policy.bindings = policy.bindings || [];

        for (const binding of policy.bindings) {
            if (binding.role === role) {
                roleFound = true;
                binding.members = binding.members.filter((m: string) => m !== memberName);
                break;
            }
        }

        if (!roleFound) return true; // Already gone

        // Set updated IAM policy
        const setPolicyRes = await fetch(`${CRM_API}/projects/${projectId}:setIamPolicy`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ policy }),
        });

        if (!setPolicyRes.ok) {
            throw new Error(`Failed to set IAM policy: ${await setPolicyRes.text()}`);
        }

        return true;
    } catch (error) {
        console.error(`[IAM] Failed to revoke role ${role} from ${member}:`, error);
        return false;
    }
}

/**
 * Grant a role to a service account at the project level
 */
export async function grantProjectRole(
    projectId: string,
    member: string,
    role: string
): Promise<boolean> {
    if (process.env.MOCK_DB === 'true') {
        console.log(`[IAM] MOCK: Granting ${role} to ${member} in ${projectId}`);
        return true;
    }

    try {
        const policy = await getProjectIamPolicy(projectId);
        const memberName = member.startsWith('serviceAccount:') ? member : `serviceAccount:${member}`;
        const accessToken = await getGcpAccessToken();

        // 2. Update policy
        let roleFound = false;
        policy.bindings = policy.bindings || [];

        for (const binding of policy.bindings) {
            if (binding.role === role) {
                roleFound = true;
                if (!binding.members.includes(memberName)) {
                    binding.members.push(memberName);
                }
                break;
            }
        }

        if (!roleFound) {
            policy.bindings.push({
                role,
                members: [memberName],
            });
        }

        // 3. Set updated IAM policy
        const setPolicyRes = await fetch(`${CRM_API}/projects/${projectId}:setIamPolicy`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ policy }),
        });

        if (!setPolicyRes.ok) {
            throw new Error(`Failed to set IAM policy: ${await setPolicyRes.text()}`);
        }

        return true;
    } catch (error) {
        console.error(`[IAM] Failed to grant role ${role} to ${member}:`, error);
        return false;
    }
}

/**
 * Grant roles/cloudsql.instanceUser to a service account
 */
export async function grantCloudSqlInstanceUserRole(
    projectId: string,
    serviceAccountEmail: string
): Promise<boolean> {
    return grantProjectRole(projectId, serviceAccountEmail, 'roles/cloudsql.instanceUser');
}

/**
 * Check if a member has excessive (non-least-privilege) roles
 */
export async function checkLeastPrivilege(
    projectId: string,
    member: string
): Promise<{ overprivileged: boolean; excessiveRoles: string[] }> {
    try {
        const policy = await getProjectIamPolicy(projectId);
        const memberName = member.startsWith('serviceAccount:') ? member : `serviceAccount:${member}`;

        const foundExcessive: string[] = [];

        for (const binding of (policy.bindings || [])) {
            if (EXCESSIVE_PROJECT_ROLES.includes(binding.role) && binding.members.includes(memberName)) {
                foundExcessive.push(binding.role);
            }
        }

        return {
            overprivileged: foundExcessive.length > 0,
            excessiveRoles: foundExcessive
        };
    } catch (error) {
        console.error(`[IAM] Failed to check least privilege for ${member}:`, error);
        return { overprivileged: false, excessiveRoles: [] };
    }
}

/**
 * Check if a member has broad (project-level) secret manager access
 */
export async function checkBroadSecretAccess(
    projectId: string,
    member: string
): Promise<boolean> {
    try {
        const policy = await getProjectIamPolicy(projectId);
        const memberName = member.startsWith('serviceAccount:') ? member : `serviceAccount:${member}`;

        const broadRoles = ['roles/secretmanager.secretAccessor', 'roles/secretmanager.admin', 'roles/editor', 'roles/owner'];

        for (const binding of (policy.bindings || [])) {
            if (broadRoles.includes(binding.role) && binding.members.includes(memberName)) {
                return true;
            }
        }

        return false;
    } catch (error) {
        console.error(`[IAM] Failed to check broad secret access for ${member}:`, error);
        return false;
    }
}
