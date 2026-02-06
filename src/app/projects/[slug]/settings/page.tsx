import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getProjectBySlugGlobal, getTeamMembership } from '@/lib/db';
import { SettingsClient } from './SettingsClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const session = await getSession();

    if (!session) {
        redirect('/login');
    }

    const project = await getProjectBySlugGlobal(slug);

    if (!project) {
        notFound();
    }

    // Check permissions
    // 1. If user is the owner (personal project)
    const isOwner = project.userId === session.user.id;

    // 2. If project belongs to a team, check membership
    let isTeamMember = false;
    if (project.teamId) {
        const membership = await getTeamMembership(project.teamId, session.user.id);
        if (membership) {
            isTeamMember = true;
        }
    }

    if (!isOwner && !isTeamMember) {
        notFound();
    }

    return (
        <div className="container max-w-5xl py-8 px-6">
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Project Settings</h1>
                <p className="text-[var(--muted-foreground)] mt-2 text-lg">
                    Manage your project configuration, domains, and deployment settings.
                </p>
            </div>
            <SettingsClient project={project} user={session.user} />
        </div>
    );
}
