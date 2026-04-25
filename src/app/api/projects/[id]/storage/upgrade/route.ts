import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { updateProject } from '@/lib/db';
import { upsertSecret } from '@/lib/gcp/secrets';
import { generateId } from '@/lib/utils';
import type { StorageConfig, StorageType, EnvVariable } from '@/types';

/**
 * Upgrade an environment variable to a managed connector
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();
        const { envKey } = body;

        if (!envKey) {
            return NextResponse.json({ success: false, error: 'Environment variable key is required' }, { status: 400 });
        }

        const access = await checkProjectAccess(session.user.id, id);
        if (!access.allowed || !access.project) {
            return NextResponse.json({ success: false, error: access.error }, { status: access.status });
        }

        const project = access.project;
        const envVars = project.envVariables || [];
        const envVar = envVars.find((v: EnvVariable) => v.key === envKey);

        if (!envVar) {
            return NextResponse.json({ success: false, error: `Environment variable '${envKey}' not found` }, { status: 404 });
        }

        // Determine connector type based on value or key
        let type: StorageType = 'generic';
        const value = envVar.value.toLowerCase();

        if (value.startsWith('postgres://') || value.startsWith('postgresql://')) {
            type = value.includes('supabase') ? 'supabase' : (value.includes('neon.tech') ? 'neon' : 'cloud-sql-postgres');
        } else if (value.startsWith('mysql://')) {
            type = value.includes('pscale') ? 'planetscale' : 'cloud-sql-mysql';
        } else if (value.startsWith('mongodb')) {
            type = 'mongodb-atlas';
        } else if (value.startsWith('redis')) {
            type = 'memorystore-redis';
        }

        const storageId = generateId('storage');
        const secretId = `deployify-${id}-${storageId}-conn`;

        // 1. Move value to Secret Manager
        await upsertSecret(secretId, envVar.value);

        // 2. Create Storage Config
        const newConfig: StorageConfig = {
            id: storageId,
            name: `${envKey} (Upgraded)`,
            type,
            status: 'active',
            connectionStringSecretId: secretId,
            envKey,
            environment: envVar.environment || 'both',
            createdAt: new Date(),
            updatedAt: new Date(),
            metadata: {
                upgradedFromEnvVar: true,
                originalEnvVarId: envVar.id
            }
        };

        // 3. Update project: add connector and remove old env var
        const updatedConfigs = [...(project.storageConfigs || []), newConfig];
        const updatedEnvVars = envVars.filter((v: EnvVariable) => v.key !== envKey);

        await updateProject(id, {
            storageConfigs: updatedConfigs,
            envVariables: updatedEnvVars
        });

        return NextResponse.json({
            success: true,
            storageConfig: newConfig
        });

    } catch (error) {
        console.error('[StorageUpgrade] Error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Internal server error'
        }, { status: 500 });
    }
}
