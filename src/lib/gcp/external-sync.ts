import { upsertSecret } from './secrets';
import type { StorageConfig } from '@/types';

export interface SyncResult {
    success: boolean;
    connectionString?: string;
    lastSyncedAt: Date;
    error?: string;
}

/**
 * Synchronize external connector credentials from provider APIs
 */
export async function syncExternalConnector(
    projectId: string,
    storage: StorageConfig
): Promise<SyncResult> {
    const now = new Date();
    const providerApiKey = storage.metadata?.providerApiKey as string;

    if (process.env.MOCK_DB !== 'true' && !providerApiKey) {
        return {
            success: false,
            error: `Auto-sync requires a Provider API Key for ${storage.type}. Please update the connector settings.`,
            lastSyncedAt: now
        };
    }

    try {
        let newConnectionString = '';

        if (process.env.MOCK_DB === 'true') {
            // Simulate API fetch delay
            await new Promise(resolve => setTimeout(resolve, 500));
            newConnectionString = storage.type === 'supabase'
                ? 'postgresql://postgres:mock@db.supabase.co:5432/postgres'
                : storage.type === 'mongodb-atlas'
                ? 'mongodb+srv://mock:password@cluster.mongodb.net/test'
                : 'mysql://mock:password@aws.connect.psdb.cloud/test';
        } else {
            if (storage.type === 'supabase') {
                const supabaseId = storage.metadata?.supabaseId as string;
                if (!supabaseId) throw new Error('Supabase Reference ID is missing in metadata');

                const res = await fetch(`https://api.supabase.com/v1/projects/${supabaseId}/config/database`, {
                    headers: { 'Authorization': `Bearer ${providerApiKey}` }
                });

                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(`Supabase API error: ${errorText}`);
                }

                const data = await res.json();
                newConnectionString = `postgresql://postgres:${data.password || 'password'}@db.${supabaseId}.supabase.co:5432/postgres`;
            } else if (storage.type === 'mongodb-atlas') {
                const groupId = storage.metadata?.groupId as string;
                const clusterName = storage.metadata?.clusterName as string;

                if (!groupId) throw new Error('MongoDB Atlas Group ID is missing in connector metadata');
                if (!clusterName) throw new Error('MongoDB Atlas Cluster Name is missing in connector metadata');

                const res = await fetch(`https://cloud.mongodb.com/api/atlas/v1.0/groups/${groupId}/clusters/${clusterName}`, {
                    headers: {
                        'Authorization': `Bearer ${providerApiKey}`,
                        'Accept': 'application/json'
                    }
                });

                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(`MongoDB Atlas API error (${res.status}): ${errorText || 'Failed to fetch cluster details'}`);
                }

                const data = await res.json();
                newConnectionString = data.connectionStrings?.standardSrv || `mongodb+srv://user:password@${clusterName}.mongodb.net/test`;
            } else if (storage.type === 'planetscale') {
                const organization = storage.metadata?.organization as string;
                const database = storage.metadata?.database as string;
                if (!organization || !database) throw new Error('PlanetScale Organization or Database name is missing');

                // 1. Create a new "deployify-managed" password
                const createRes = await fetch(`https://api.planetscale.com/v1/organizations/${organization}/databases/${database}/passwords`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${providerApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: `deployify-sync-${now.getTime()}`,
                        role: 'readwriter'
                    })
                });

                if (!createRes.ok) {
                    const errorText = await createRes.text();
                    throw new Error(`PlanetScale API error (Create): ${errorText}`);
                }

                const newPwd = await createRes.json();
                if (newPwd.username && newPwd.plain_text && newPwd.access_host) {
                    newConnectionString = `mysql://${newPwd.username}:${newPwd.plain_text}@${newPwd.access_host}/${database}?ssl={"rejectUnauthorized":true}`;
                } else {
                    throw new Error('Failed to retrieve full credential set from PlanetScale API');
                }

                // 2. List existing passwords and cleanup old "deployify-sync-*" ones
                try {
                    const listRes = await fetch(`https://api.planetscale.com/v1/organizations/${organization}/databases/${database}/passwords`, {
                        headers: { 'Authorization': `Bearer ${providerApiKey}` }
                    });

                    if (listRes.ok) {
                        const passwords = await listRes.json();
                        // Filter for passwords created by deployify sync that aren't the one we just created
                        const oldPasswords = (passwords.data || passwords || []).filter((p: { id: string, name?: string }) =>
                            p.name?.startsWith('deployify-sync-') && p.id !== newPwd.id
                        );

                        for (const oldPwd of oldPasswords) {
                            await fetch(`https://api.planetscale.com/v1/organizations/${organization}/databases/${database}/passwords/${oldPwd.id}`, {
                                method: 'DELETE',
                                headers: { 'Authorization': `Bearer ${providerApiKey}` }
                            });
                        }
                    }
                } catch (cleanupError) {
                    console.warn(`[StorageSync] PlanetScale password cleanup failed:`, cleanupError);
                    // Don't fail the whole sync if cleanup fails
                }
            }
        }

        if (newConnectionString && storage.connectionStringSecretId) {
            await upsertSecret(`deployify-${projectId}-${storage.id}-conn`, newConnectionString);
        }

        return {
            success: true,
            connectionString: newConnectionString,
            lastSyncedAt: now
        };
    } catch (error) {
        console.error(`External sync failed for ${storage.type}:`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown sync error',
            lastSyncedAt: now
        };
    }
}
