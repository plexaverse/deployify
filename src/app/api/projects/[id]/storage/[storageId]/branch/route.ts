import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getSecretValue } from '@/lib/gcp/secrets';
import { ensureEphemeralDatabase } from '@/lib/gcp/cloudsql';
import type { StorageConfig } from '@/types';

/**
 * POST - Trigger provisioning of an ephemeral storage branch
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id, storageId } = await params;
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const { project } = access;
        const storageConfig = project.storageConfigs?.find((s: StorageConfig) => s.id === storageId);

        if (!storageConfig) {
            return NextResponse.json({ error: 'Storage connector not found' }, { status: 404 });
        }

        if (!storageConfig.branchingSettings?.enabled) {
            return NextResponse.json({ error: 'Branching is not enabled for this connector' }, { status: 400 });
        }

        const body = await request.json();
        const { branch, pullRequestNumber } = body;

        if (!branch && !pullRequestNumber) {
            return NextResponse.json({ error: 'Branch name or PR number is required' }, { status: 400 });
        }

        const identifier = pullRequestNumber ? `pr${pullRequestNumber}` : branch.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

        // Perform side-effect provisioning based on type
        if (storageConfig.type.includes('cloud-sql')) {
            const instanceName = storageConfig.metadata?.resourceName as string;
            if (!instanceName) {
                return NextResponse.json({ error: 'Cloud SQL instance name not found in metadata' }, { status: 400 });
            }

            const connectionString = await getSecretValue(storageConfig.connectionStringSecretId!);
            const url = new URL(connectionString);
            const baseDbName = url.pathname.split('/')[1] || 'postgres';
            const template = storageConfig.branchingSettings.template || '{base}_{identifier}';
            const branchDbName = template
                .replace('{base}', baseDbName)
                .replace('{identifier}', identifier);

            await ensureEphemeralDatabase(instanceName, branchDbName);

            return NextResponse.json({
                success: true,
                databaseName: branchDbName,
                message: `Ephemeral database ${branchDbName} ensured for ${identifier}`
            });
        }

        // Add support for other types if needed (Firestore prefixing is handled at injection)
        return NextResponse.json({
            success: true,
            message: `Branching context established for ${identifier}`
        });

    } catch (error) {
        console.error('Storage branching error:', error);
        return NextResponse.json({ error: 'Failed to provision storage branch' }, { status: 500 });
    }
}
