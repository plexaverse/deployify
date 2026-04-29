import type { ConnectivityTopology, StorageConfig } from '@/types';

/**
 * Derives the connectivity topology for a given storage configuration
 */
export function deriveTopology(storage: StorageConfig): ConnectivityTopology {
    const topology: ConnectivityTopology = {
        injectionMethod: 'SECRET',
        path: ['Cloud Run'],
        isEncrypted: !!storage.ssl,
        lastVerifiedAt: new Date().toISOString()
    };

    if (storage.type === 'memorystore-redis') {
        topology.injectionMethod = 'VPC';
        topology.path.push('Direct VPC Egress', 'Memorystore (Redis)');
    } else if (storage.type.includes('cloud-sql')) {
        topology.injectionMethod = 'PROXY';
        topology.path.push('Cloud SQL Auth Proxy', storage.type === 'cloud-sql-postgres' ? 'PostgreSQL' : 'MySQL');
    } else if (storage.type === 'firestore') {
        topology.injectionMethod = 'DIRECT';
        topology.path.push('IAM Service Account', 'Firestore (Native)');
        topology.isEncrypted = true;
    } else if (['supabase', 'neon', 'planetscale', 'mongodb-atlas'].includes(storage.type)) {
        topology.injectionMethod = 'SECRET';
        topology.path.push('Secret Manager', storage.type.charAt(0).toUpperCase() + storage.type.slice(1));
    } else {
        topology.path.push('Secret Manager', 'Generic Endpoint');
    }

    return topology;
}
