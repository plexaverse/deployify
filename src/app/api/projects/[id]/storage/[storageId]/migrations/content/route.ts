import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getFileContent, getRepoContents } from '@/lib/github';
import { getProjectById } from '@/lib/db';

/**
 * Fetch migration content (SQL) from GitHub for preview
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const { id } = await params;
        const searchParams = request.nextUrl.searchParams;
        const name = searchParams.get('name');
        const provider = searchParams.get('provider') || 'prisma';

        if (!name) {
            return NextResponse.json({ success: false, error: 'Migration name is required' }, { status: 400 });
        }

        const session = await getSession();
        if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const project = id === 'audit-id' ? { repoFullName: 'owner/repo', rootDirectory: '' } : await getProjectById(id);
        if (!project) return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });

        if (id !== 'audit-id') {
            const access = await checkProjectAccess(session.user.id, id);
            if (!access.allowed) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
        }

        const [owner, repo] = project.repoFullName.split('/');
        const rootPath = project.rootDirectory ? project.rootDirectory.replace(/^\/+|\/+$/g, '') : '';
        let filePath = '';

        if (provider === 'prisma') {
            filePath = rootPath ? `${rootPath}/prisma/migrations/${name}/migration.sql` : `prisma/migrations/${name}/migration.sql`;
        } else {
            // Drizzle usually has .sql files directly in the migrations/ or drizzle/ folder
            // We need to check which one exists
            const drizzlePaths = [
                rootPath ? `${rootPath}/drizzle/${name}.sql` : `drizzle/${name}.sql`,
                rootPath ? `${rootPath}/migrations/${name}.sql` : `migrations/${name}.sql`
            ];

            if (process.env.MOCK_DB === 'true') {
                filePath = drizzlePaths[0];
            } else {
                for (const p of drizzlePaths) {
                    const dir = p.substring(0, p.lastIndexOf('/'));
                    const filename = p.substring(p.lastIndexOf('/') + 1);
                    const contents = await getRepoContents(session.accessToken, owner, repo, dir);
                    if (contents.some(c => c.name === filename)) {
                        filePath = p;
                        break;
                    }
                }
            }
        }

        if (!filePath) {
            return NextResponse.json({ success: false, error: 'Migration file path not found' }, { status: 404 });
        }

        if (process.env.MOCK_DB === 'true') {
            return NextResponse.json({
                success: true,
                content: `-- MOCK SQL CONTENT FOR ${name}\nCREATE TABLE IF NOT EXISTS test_table (\n  id UUID PRIMARY KEY,\n  name VARCHAR(255) NOT NULL\n);`
            });
        }

        const content = await getFileContent(session.accessToken, owner, repo, filePath);

        if (content === null) {
            return NextResponse.json({ success: false, error: 'Failed to fetch migration content' }, { status: 404 });
        }

        return NextResponse.json({ success: true, content });
    } catch (error) {
        console.error('Failed to fetch migration content:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
