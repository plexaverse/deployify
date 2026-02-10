'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { EnvVariablesSection } from '@/components/EnvVariablesSection';
import { DomainsSection } from '@/components/DomainsSection';
import { RegionSettings } from '@/components/RegionSettings';
import { ResourceSettings } from '@/components/ResourceSettings';
import { BranchDeploymentsSettings } from '@/components/BranchDeploymentsSettings';
import { BuildSettings } from '@/components/project-settings/BuildSettings';
import { NotificationSettings } from '@/components/project-settings/NotificationSettings';
import { SecuritySettings } from '@/components/project-settings/SecuritySettings';
import { DangerZone } from '@/components/project-settings/DangerZone';
import { useStore } from '@/store';

export default function ProjectSettingsPage() {
    const params = useParams();
    const {
        currentProject: project,
        isLoadingProject: loading,
        fetchProjectDetails
    } = useStore();

    useEffect(() => {
        if (params.id) {
            fetchProjectDetails(params.id as string);
        }
    }, [params.id, fetchProjectDetails]);

    if (loading) {
        return (
            <div className="p-8">
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
            </div>
        );
    }

    if (!project) {
        return null;
    }

    return (
        <div className="p-8 max-w-4xl">
            {/* Breadcrumb */}
            <Link
                href={`/dashboard/${project.id}`}
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to {project.name}
            </Link>

            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold mb-1">Project Settings</h1>
                <p className="text-muted-foreground">
                    Configure settings for {project.name}
                </p>
            </div>

            {/* Domains Section */}
            <DomainsSection
                projectId={project.id}
                productionUrl={project.productionUrl}
                onUpdate={() => fetchProjectDetails(project.id)}
            />

            {/* Environment Variables Section */}
            <div className="mt-8">
                <EnvVariablesSection
                    projectId={project.id}
                    onUpdate={() => fetchProjectDetails(project.id)}
                />
            </div>

            {/* Region Settings */}
            <RegionSettings
                projectId={project.id}
                onUpdate={() => fetchProjectDetails(project.id)}
            />

            {/* Resource Settings */}
            <ResourceSettings
                projectId={project.id}
                onUpdate={() => fetchProjectDetails(project.id)}
            />

            {/* Build Settings */}
            <div className="mt-8">
                <BuildSettings projectId={project.id} />
            </div>

            {/* Branch Deployments */}
            <BranchDeploymentsSettings
                projectId={project.id}
                onUpdate={() => fetchProjectDetails(project.id)}
            />

            {/* Notifications */}
            <NotificationSettings projectId={project.id} />

            {/* Security */}
            <SecuritySettings projectId={project.id} />

            {/* Danger Zone */}
            <DangerZone projectId={project.id} />
        </div>
    );
}
