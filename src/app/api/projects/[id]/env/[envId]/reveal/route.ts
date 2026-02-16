import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { decrypt } from '@/lib/encryption';
import type { EnvVariable } from '@/types';

// GET /api/projects/[id]/env/[envId]/reveal - Reveal secret environment variable
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; envId: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id, envId } = await params;
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json(
                { error: access.error },
                { status: access.status }
            );
        }

        // Restrict viewers from revealing secrets
        if (access.role === 'viewer') {
             return NextResponse.json(
                { error: 'Forbidden: Viewers cannot reveal secret values' },
                { status: 403 }
            );
        }

        const { project } = access;
        const envVariables = project.envVariables || [];
        const env = envVariables.find((e: EnvVariable) => e.id === envId);

        if (!env) {
            return NextResponse.json({ error: 'Environment variable not found' }, { status: 404 });
        }

        let value = env.value;

        if (env.isSecret && env.isEncrypted) {
            try {
                value = decrypt(env.value);
            } catch (e) {
                console.error('Failed to decrypt env var:', e);
                return NextResponse.json({ error: 'Failed to decrypt value' }, { status: 500 });
            }
        }
        // If isSecret but not isEncrypted, we return raw value (legacy behavior, assuming DB has plain text).
        // If not isSecret, we return raw value.

        return NextResponse.json({ value });

    } catch (error) {
        console.error('Error revealing env variable:', error);
        return NextResponse.json(
            { error: 'Failed to reveal environment variable' },
            { status: 500 }
        );
    }
}
