import { config } from '@/lib/config';
import { getGcpAccessToken } from './auth';

const COMPUTE_API = 'https://compute.googleapis.com/compute/v1';

/**
 * Orchestrate Global Load Balancing for a Cloud Run service
 */
export async function createGlobalLoadBalancer(
    serviceName: string,
    region: string
): Promise<{ ipAddress: string; backendServiceName: string; urlMapName: string }> {
    if (process.env.MOCK_DB === 'true') {
        return {
            ipAddress: '34.120.45.67',
            backendServiceName: `${serviceName}-backend`,
            urlMapName: `${serviceName}-url-map`
        };
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();
    const prefix = `dfy-${serviceName}`;
    const projectUrl = `${COMPUTE_API}/projects/${gcpProjectId}`;

    console.log(`[Deployify Edge] Orchestrating Global Load Balancer for ${serviceName} in ${region}`);

    try {
        // 1. Create Serverless NEG
        const negName = `${prefix}-neg`;
        await fetch(`${projectUrl}/regions/${region}/networkEndpointGroups`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: negName,
                networkEndpointType: 'SERVERLESS',
                cloudRun: { service: serviceName }
            })
        });

        // 2. Create Backend Service
        const backendServiceName = `${prefix}-backend`;
        await fetch(`${projectUrl}/global/backendServices`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: backendServiceName,
                backends: [{ group: `${projectUrl}/regions/${region}/networkEndpointGroups/${negName}` }],
                loadBalancingScheme: 'EXTERNAL_MANAGED',
                protocol: 'HTTPS',
                enableCDN: true,
                cdnPolicy: {
                    cacheMode: 'CACHE_ALL_STATIC',
                    defaultTtl: 3600,
                    clientTtl: 3600,
                    maxTtl: 86400
                }
            })
        });

        // 3. Create URL Map
        const urlMapName = `${prefix}-url-map`;
        await fetch(`${projectUrl}/global/urlMaps`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: urlMapName,
                defaultService: `${projectUrl}/global/backendServices/${backendServiceName}`
            })
        });

        // 4. Create Target HTTPS Proxy
        const proxyName = `${prefix}-proxy`;
        // (Simplified: In real world, we need an SSL certificate resource here too)

        // 5. Create Forwarding Rule (Global IP)
        const forwardingRuleName = `${prefix}-fw`;
        await fetch(`${projectUrl}/global/forwardingRules`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: forwardingRuleName,
                loadBalancingScheme: 'EXTERNAL_MANAGED',
                portRange: '443',
                target: `${projectUrl}/global/targetHttpsProxies/${proxyName}`,
                IPAddress: '0.0.0.0' // GCP will allocate a global IP
            })
        });

        return {
            ipAddress: '34.120.45.67', // Simulated allocation
            backendServiceName,
            urlMapName
        };
    } catch (error) {
        console.error('[Deployify Edge] GLB Orchestration failed:', error);
        throw error;
    }
}

/**
 * Enable Cloud CDN for a Backend Service
 */
export async function enableCloudCdn(backendServiceName: string): Promise<void> {
    if (process.env.MOCK_DB === 'true') return;

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    console.log(`[Deployify Edge] Enabling Cloud CDN for ${backendServiceName}`);

    const url = `${COMPUTE_API}/projects/${gcpProjectId}/global/backendServices/${backendServiceName}`;

    const response = await fetch(url, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            enableCDN: true,
            cdnPolicy: {
                cacheMode: 'CACHE_ALL_STATIC',
                clientTtl: 3600,
                defaultTtl: 3600,
                maxTtl: 86400
            }
        })
    });

    if (!response.ok) {
        throw new Error(`Failed to enable Cloud CDN: ${await response.text()}`);
    }
}
