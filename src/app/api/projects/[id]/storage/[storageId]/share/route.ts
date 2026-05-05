import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getProjectById, updateProject } from '@/lib/db';
import { grantSecretAccess } from '@/lib/gcp/secrets';
import { getGcpProjectNumber } from '@/lib/gcp/auth';

/**
 * Manage cross-project resource sharing for a storage connector
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const { id, storageId } = await params;
        const body = await request.json();
        const { targetProjectId, action } = body; // action: 'share' | 'revoke'

        const session = await getSession();
        if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const access = await checkProjectAccess(session.user.id, id);
        if (!access.allowed || (access.role !== 'owner' && access.role !== 'admin')) {
            return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
        }

        const project = access.project!;
        const storageIndex = project.storageConfigs?.findIndex(s => s.id === storageId);
        if (storageIndex === undefined || storageIndex === -1) {
            return NextResponse.json({ success: false, error: 'Storage connector not found' }, { status: 404 });
        }

        const storage = project.storageConfigs![storageIndex];
        const sharedWith = new Set(storage.sharedWithProjects || []);

        if (action === 'share') {
            if (!targetProjectId) return NextResponse.json({ success: false, error: 'Target project ID is required' }, { status: 400 });

            const targetProject = await getProjectById(targetProjectId);
            if (!targetProject) return NextResponse.json({ success: false, error: 'Target project not found' }, { status: 404 });

            // Ensure they belong to the same team
            if (targetProject.teamId !== project.teamId) {
                return NextResponse.json({ success: false, error: 'Cannot share resources across teams' }, { status: 403 });
            }

            sharedWith.add(targetProjectId);

            // Automate IAM Secret Accessor grant for the target project's compute identity
            if (storage.connectionStringSecretId && process.env.MOCK_DB !== 'true') {
                try {
                    const projectNumber = await getGcpProjectNumber(targetProjectId);
                    const targetServiceAccount = `${projectNumber}-compute@developer.gserviceaccount.com`;

                    await grantSecretAccess(
                        storage.connectionStringSecretId,
                        targetServiceAccount,
                        'roles/secretmanager.secretAccessor'
                    );
                } catch (e) {
                    console.warn(`[Sharing] Failed to automate IAM grant for ${targetProjectId}:`, e);
                    // We continue as the sharing metadata is still useful for references
                }
            }
        } else if (action === 'revoke') {
            sharedWith.delete(targetProjectId);
        }

        storage.sharedWithProjects = Array.from(sharedWith);
        project.storageConfigs![storageIndex] = storage;

        await updateProject(id, { storageConfigs: project.storageConfigs });

        return NextResponse.json({ success: true, sharedWithProjects: storage.sharedWithProjects });
    } catch (error) {
        console.error('[Sharing] Error:', error);
        return NextResponse.json({ success: false, error: 'Failed to update sharing settings' }, { status: 500 });
    }
}
