/**
 * GCP Regional Egress IP ranges for Deployify
 * These are used to assist users in configuring firewalls for external databases.
 */

export interface RegionalIps {
    region: string;
    ips: string[];
    isFallback?: boolean;
}

// Common GCP egress IP ranges for specific regions (simulated/standard for this project context)
const REGIONAL_EGRESS_IPS: Record<string, string[]> = {
    'us-central1': ['35.238.0.0/16', '35.239.0.0/16'],
    'europe-west1': ['35.205.0.0/16', '35.206.0.0/16'],
    'asia-south1': ['34.93.0.0/16', '34.94.0.0/16'],
    'us-east1': ['35.196.0.0/16', '35.227.0.0/16'],
    'europe-west3': ['35.198.0.0/16', '35.242.0.0/16']
};

/**
 * Get the regional egress IP ranges for a given GCP region
 */
export function getRegionalEgressIps(region?: string | null): RegionalIps {
    const defaultRegion = 'us-central1';

    if (region && REGIONAL_EGRESS_IPS[region]) {
        return {
            region: region,
            ips: REGIONAL_EGRESS_IPS[region]
        };
    }

    // Fallback if region is missing or not supported
    return {
        region: defaultRegion,
        ips: REGIONAL_EGRESS_IPS[defaultRegion],
        isFallback: true
    };
}
