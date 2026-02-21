import { config } from '@/lib/config';

const COMPUTE_API = 'https://compute.googleapis.com/compute/v1';

interface SecurityPolicyRule {
    priority: number;
    action: string;
    match: {
        config: {
            srcIpRanges: string[];
        };
        versionedExpr: 'SRC_IPS_V1';
    };
    description?: string;
    preview?: boolean;
}

interface SecurityPolicy {
    name: string;
    id: string;
    rules: SecurityPolicyRule[];
    fingerprint?: string;
}

interface Operation {
    name: string;
    status: 'PENDING' | 'RUNNING' | 'DONE';
    selfLink: string;
    error?: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        errors: any[];
    };
}

/**
 * Update Cloud Armor security policy for a project
 */
export async function updateProjectFirewall(
    projectSlug: string,
    ipRules: { allow: string[]; block: string[] },
    accessToken: string
): Promise<void> {
    const policyName = `dfy-${projectSlug}-policy`;
    const description = `Security policy for project ${projectSlug}`;

    // 1. Get or create security policy
    let policy = await getSecurityPolicy(policyName, accessToken);

    if (!policy) {
        policy = await createSecurityPolicy(policyName, description, accessToken);
    }

    // 2. Identify rules to remove (range 1000-3000)
    const rulesToRemove = (policy.rules || [])
        .filter(r => r.priority >= 1000 && r.priority <= 3000)
        .map(r => r.priority);

    // 3. Remove existing rules sequentially
    for (const priority of rulesToRemove) {
        await removeRule(policyName, priority, accessToken);
    }

    // 4. Create new rules
    const newRules: SecurityPolicyRule[] = [];

    // Block rules: Priority 1000+
    const blockChunks = chunkArray(ipRules.block, 10);
    blockChunks.forEach((chunk, index) => {
        newRules.push({
            priority: 1000 + index,
            action: 'deny(403)',
            match: {
                config: { srcIpRanges: chunk },
                versionedExpr: 'SRC_IPS_V1',
            },
            description: 'Block list',
        });
    });

    // Allow rules: Priority 2000+
    const allowChunks = chunkArray(ipRules.allow, 10);
    allowChunks.forEach((chunk, index) => {
        newRules.push({
            priority: 2000 + index,
            action: 'allow',
            match: {
                config: { srcIpRanges: chunk },
                versionedExpr: 'SRC_IPS_V1',
            },
            description: 'Allow list',
        });
    });

    // Deny all others if allow list is present: Priority 3000
    if (ipRules.allow.length > 0) {
        newRules.push({
            priority: 3000,
            action: 'deny(403)',
            match: {
                config: { srcIpRanges: ['*'] },
                versionedExpr: 'SRC_IPS_V1',
            },
            description: 'Deny all other IPs',
        });
    }

    // 5. Add new rules sequentially
    for (const rule of newRules) {
        await addRule(policyName, rule, accessToken);
    }
}

async function getSecurityPolicy(name: string, accessToken: string): Promise<SecurityPolicy | null> {
    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const response = await fetch(
        `${COMPUTE_API}/projects/${gcpProjectId}/global/securityPolicies/${name}`,
        {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }
    );

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        throw new Error(`Failed to get security policy: ${response.statusText}`);
    }

    return await response.json();
}

async function createSecurityPolicy(name: string, description: string, accessToken: string): Promise<SecurityPolicy> {
    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const response = await fetch(
        `${COMPUTE_API}/projects/${gcpProjectId}/global/securityPolicies`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name,
                description,
                type: 'CLOUD_ARMOR',
            }),
        }
    );

    if (!response.ok) {
        throw new Error(`Failed to create security policy: ${response.statusText}`);
    }

    const operation = await response.json();
    await waitForOperation(operation, accessToken);

    // Return empty policy structure as it's fresh
    return {
        name,
        id: '',
        rules: [],
    };
}

async function removeRule(policyName: string, priority: number, accessToken: string): Promise<void> {
    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const response = await fetch(
        `${COMPUTE_API}/projects/${gcpProjectId}/global/securityPolicies/${policyName}/removeRule?priority=${priority}`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }
    );

    if (!response.ok) {
        if (response.status === 404) return;
        throw new Error(`Failed to remove rule ${priority}: ${response.statusText}`);
    }

    const operation = await response.json();
    await waitForOperation(operation, accessToken);
}

async function addRule(policyName: string, rule: SecurityPolicyRule, accessToken: string): Promise<void> {
    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const response = await fetch(
        `${COMPUTE_API}/projects/${gcpProjectId}/global/securityPolicies/${policyName}/addRule`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(rule),
        }
    );

    if (!response.ok) {
        throw new Error(`Failed to add rule ${rule.priority}: ${response.statusText}`);
    }

    const operation = await response.json();
    await waitForOperation(operation, accessToken);
}

async function waitForOperation(operation: Operation, accessToken: string): Promise<void> {
    const operationUrl = operation.selfLink;
    if (!operationUrl) return;

    // Poll until DONE
    while (true) {
        const response = await fetch(operationUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
             throw new Error(`Failed to poll operation: ${response.statusText}`);
        }

        const op: Operation = await response.json();

        if (op.status === 'DONE') {
            if (op.error) {
                throw new Error(`Operation failed: ${JSON.stringify(op.error)}`);
            }
            return;
        }

        // Wait 500ms before next poll
        await new Promise(resolve => setTimeout(resolve, 500));
    }
}

function chunkArray<T>(array: T[], size: number): T[][] {
    const chunked: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunked.push(array.slice(i, i + size));
    }
    return chunked;
}
