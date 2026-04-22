import { getGcpAccessToken } from './auth';
import { config } from '@/lib/config';

const CRM_API = 'https://cloudresourcemanager.googleapis.com/v1';

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
        const accessToken = await getGcpAccessToken();

        // 1. Get current IAM policy
        const getPolicyRes = await fetch(`${CRM_API}/projects/${projectId}:getIamPolicy`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
        });

        if (!getPolicyRes.ok) {
            throw new Error(`Failed to get IAM policy: ${await getPolicyRes.text()}`);
        }

        const policy = await getPolicyRes.json();
        const memberName = member.startsWith('serviceAccount:') ? member : `serviceAccount:${member}`;

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
