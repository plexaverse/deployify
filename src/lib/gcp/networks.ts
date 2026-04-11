/**
 * GCP Regional Egress IP ranges for Cloud Run and Cloud Build.
 * These are used to provide recommendations for external database firewall configuration.
 * Source: https://www.gstatic.com/ipranges/cloud.json (Filtered by region)
 */
export const REGIONAL_EGRESS_IPS: Record<string, string[]> = {
    'us-central1': [
        '35.192.0.0/14',
        '35.224.0.0/13',
        '35.238.0.0/15',
        '104.197.0.0/16'
    ],
    'europe-west1': [
        '35.205.0.0/16',
        '35.240.0.0/15',
        '104.199.0.0/16'
    ],
    'asia-south1': [
        '35.200.128.0/17',
        '35.244.0.0/16',
        '34.93.0.0/16'
    ],
    'us-east1': [
        '35.185.0.0/16',
        '35.196.0.0/15',
        '104.196.0.0/16'
    ],
    'europe-west3': [
        '35.198.64.0/18',
        '35.234.64.0/18',
        '104.199.128.0/17'
    ]
};

/**
 * Get egress IP ranges for a specific region
 */
export function getRegionalEgressIps(region: string): { ips: string[]; actualRegion: string } {
    const ips = REGIONAL_EGRESS_IPS[region];
    if (ips) {
        return { ips, actualRegion: region };
    }
    return { ips: REGIONAL_EGRESS_IPS['us-central1'], actualRegion: 'us-central1' };
}
