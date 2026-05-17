import { config } from '@/lib/config';
import { getGcpAccessToken } from './auth';

/**
 * Enable Cloud Armor for a Cloud Run service
 */
export async function enableCloudArmor(
    serviceName: string,
    policyName: string = 'default-waf-policy'
): Promise<void> {
    if (process.env.MOCK_DB === 'true') {
        await new Promise(resolve => setTimeout(resolve, 500));
        return;
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();
    const backendServiceName = `dfy-${serviceName}-backend`;

    console.log(`[Shield] Attaching Cloud Armor policy ${policyName} to ${backendServiceName}`);

    // Attach security policy to backend service
    const url = `https://compute.googleapis.com/compute/v1/projects/${gcpProjectId}/global/backendServices/${backendServiceName}`;

    await fetch(url, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            securityPolicy: `projects/${gcpProjectId}/global/securityPolicies/${policyName}`
        })
    });
}

/**
 * Create a standard WAF security policy
 */
export async function createSecurityPolicy(policyName: string): Promise<void> {
    if (process.env.MOCK_DB === 'true') return;

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    console.log(`[Shield] Creating WAF security policy: ${policyName}`);

    const url = `https://compute.googleapis.com/compute/v1/projects/${gcpProjectId}/global/securityPolicies`;

    await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: policyName,
            description: 'Standard WAF policy for Deployify Edge',
            rules: [
                {
                    priority: 1000,
                    match: { expr: { expression: "evaluatePreconfiguredExpr('sqli-v33-stable')" } },
                    action: 'deny(403)',
                    description: 'SQL Injection protection'
                },
                {
                    priority: 1001,
                    match: { expr: { expression: "evaluatePreconfiguredExpr('xss-v33-stable')" } },
                    action: 'deny(403)',
                    description: 'XSS protection'
                },
                {
                    priority: 2147483647,
                    match: { config: { srcIpRanges: ['*'] } },
                    action: 'allow',
                    description: 'Default allow'
                }
            ]
        })
    });
}

/**
 * Get security insights/metrics for a policy
 */
export async function getSecurityMetrics(policyName: string = 'default-waf-policy') {
    if (process.env.MOCK_DB === 'true') {
        return {
            blockedRequests: Math.floor(Math.random() * 100),
            topThreats: ['SQL Injection', 'Cross-Site Scripting'],
            status: 'active'
        };
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    // Query Cloud Monitoring for security policy drop counts
    const filter = `metric.type="compute.googleapis.com/security_policy/dropped_requests_count" AND resource.labels.security_policy_name="${policyName}"`;
    const now = new Date().toISOString();
    const startTime = new Date(Date.now() - 3600000).toISOString(); // Last hour

    const url = `https://monitoring.googleapis.com/v3/projects/${gcpProjectId}/timeSeries?filter=${encodeURIComponent(filter)}&interval.startTime=${startTime}&interval.endTime=${now}`;

    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
        console.warn('[Shield] Failed to fetch security metrics, returning defaults');
        return { blockedRequests: 0, topThreats: [], status: 'active' };
    }

    const data = await response.json();
    let blockedRequests = 0;

    if (data.timeSeries && data.timeSeries.length > 0) {
        blockedRequests = data.timeSeries[0].points.reduce((acc: number, p: any) => acc + parseInt(p.value.int64Value), 0);
    }

    return {
        blockedRequests,
        topThreats: blockedRequests > 0 ? ['SQL Injection', 'XSS'] : [],
        status: 'active'
    };
}

/**
 * Block an IP address in a security policy
 */
export async function blockIp(
    policyName: string,
    ip: string
): Promise<void> {
    if (process.env.MOCK_DB === 'true') {
        console.log(`[Shield] MOCK: Blocked IP ${ip} in policy ${policyName}`);
        return;
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    console.log(`[Shield] Blocking IP ${ip} in policy ${policyName}`);

    const url = `https://compute.googleapis.com/compute/v1/projects/${gcpProjectId}/global/securityPolicies/${policyName}/addRule`;

    // Find a free priority or use a deterministic one for IPs
    const priority = 2000 + Math.floor(Math.random() * 1000);

    await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            priority,
            match: { config: { srcIpRanges: [ip] } },
            action: 'deny(403)',
            description: `Blocked by Autonomous Threat Detection: ${ip}`
        })
    });
}
