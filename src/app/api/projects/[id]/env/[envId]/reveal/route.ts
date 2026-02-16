import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { decrypt } from '@/lib/crypto';
import { securityHeaders } from '@/lib/security';
import type { EnvVariable } from '@/types';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; envId: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: securityHeaders });
        }

        const { id, envId } = await params;
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json(
                { error: access.error },
                { status: access.status, headers: securityHeaders }
            );
        }

        // Viewers are not allowed to reveal secrets
        if (access.role === 'viewer') {
            return NextResponse.json(
                { error: 'Forbidden: Viewers cannot reveal secrets' },
                { status: 403, headers: securityHeaders }
            );
        }

        const { project } = access;
        const envVar = (project.envVariables || []).find((env: EnvVariable) => env.id === envId);

        if (!envVar) {
            return NextResponse.json({ error: 'Environment variable not found' }, { status: 404, headers: securityHeaders });
        }

        let value = envVar.value;
        if (envVar.isEncrypted) {
            try {
                value = decrypt(value);
            } catch (e) {
                console.error(`Failed to decrypt secret ${envVar.key}:`, e);
                return NextResponse.json({ error: 'Failed to decrypt secret' }, { status: 500, headers: securityHeaders });
            }
        }

        return NextResponse.json({ value }, { headers: securityHeaders });
    } catch (error) {
        console.error('Failed to reveal secret:', error);
        return NextResponse.json(
            { error: 'Failed to reveal secret' },
            { status: 500, headers: securityHeaders }
        );
    }
}
