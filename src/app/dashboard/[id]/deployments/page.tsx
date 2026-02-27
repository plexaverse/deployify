'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeftRight } from 'lucide-react';
import { toast } from 'sonner';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { DeploymentLogsModal } from '@/components/DeploymentLogsModal';
import { RollbackModal } from '@/components/RollbackModal';
import { useStore } from '@/store';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/EmptyState';
import { NoDeploymentsIllustration } from '@/components/ui/illustrations';
import { DeploymentListItem } from '@/components/DeploymentListItem';

export default function DeploymentsPage() {
    const params = useParams();
    const {
        currentProject: project,
        currentDeployments: deployments,
        isLoadingProject: loading,
        fetchProjectDetails,
        fetchDeployments,
        selectedLogsId,
        setSelectedLogsId,
        rollbackDeployment,
        setRollbackDeployment,
        cancelDeployment
    } = useStore();

    const [copiedId, setCopiedId] = useState<string | null>(null);

    useEffect(() => {
        if (params.id) {
            fetchProjectDetails(params.id as string);
        }
    }, [params.id, fetchProjectDetails]);

    // Poll for deployment updates if any are active
    useEffect(() => {
        let interval: NodeJS.Timeout;

        const hasActiveDeployments = deployments.some(d =>
            d.status === 'building' || d.status === 'queued' || d.status === 'deploying'
        );

        if (project && hasActiveDeployments) {
            interval = setInterval(() => {
                fetchDeployments(project.id);
            }, 5000);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [deployments, project, fetchDeployments]);

    const handleCopyUrl = async (text: string, id: string) => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            setCopiedId(id);
            toast.success('Copied to clipboard');
            setTimeout(() => setCopiedId(null), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
            toast.error('Failed to copy');
        }
    };

    const handleRollback = (deploymentId: string) => {
        const deployment = deployments.find(d => d.id === deploymentId);
        if (deployment) {
            setRollbackDeployment(deployment);
        }
    };

    const confirmRollback = async () => {
        if (!project || !rollbackDeployment || !rollbackDeployment.cloudRunRevision) return;
        const toastId = toast.loading('Initiating rollback...');
        try {
            const response = await fetch(`/api/projects/${project.id}/rollback`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    revisionName: rollbackDeployment.cloudRunRevision,
                }),
            });

            if (response.ok) {
                toast.success('Rollback initiated', { id: toastId });
                fetchProjectDetails(project.id);
                setRollbackDeployment(null);
            } else {
                const err = await response.json();
                toast.error(err.error || 'Failed to rollback', { id: toastId });
            }
        } catch (error) {
            console.error('Failed to rollback:', error);
            toast.error('Failed to rollback', { id: toastId });
        }
    };

    const handleCancel = async (deploymentId: string) => {
        if (!project) return;
        const toastId = toast.loading('Cancelling deployment...');
        await cancelDeployment(project.id, deploymentId);
        toast.success('Deployment cancelled', { id: toastId });
    };

    if (loading && !project) {
        return (
            <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 space-y-6">
                <Skeleton className="h-8 w-48 mb-6" />
                <div className="space-y-4">
                    {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-24 w-full rounded-xl" />
                    ))}
                </div>
            </div>
        );
    }

    if (!project) return null;

    const selectedDeployment = deployments.find(d => d.id === selectedLogsId);

    return (
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 space-y-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-3xl font-bold tracking-tight">Deployments</h1>
                    <p className="text-[var(--muted-foreground)] text-lg">
                        A history of all deployments for this project.
                    </p>
                </div>
                {deployments.length >= 2 && (
                    <Link
                        href={`/dashboard/${project.id}/deployments/compare`}
                        className={buttonVariants({ variant: 'outline', size: 'sm' })}
                    >
                        <ArrowLeftRight className="w-4 h-4 mr-2" />
                        Compare Deployments
                    </Link>
                )}
            </div>

            {deployments.length === 0 ? (
                <EmptyState
                    title="No deployments yet"
                    description="Deployments will appear here once you push code to your repository."
                    illustration={NoDeploymentsIllustration}
                />
            ) : (
                <Card className="overflow-hidden p-0">
                    <div className="divide-y divide-[var(--border)]">
                        {deployments.map((deployment) => (
                            <DeploymentListItem
                                key={deployment.id}
                                deployment={deployment}
                                onCopy={handleCopyUrl}
                                onRollback={handleRollback}
                                onCancel={handleCancel}
                                onViewLogs={setSelectedLogsId}
                                copiedId={copiedId}
                            />
                        ))}
                    </div>
                </Card>
            )}

            {project && selectedDeployment && (
                <DeploymentLogsModal
                    deployment={selectedDeployment}
                    isOpen={!!selectedLogsId}
                    onClose={() => setSelectedLogsId(null)}
                />
            )}

            {rollbackDeployment && (
                <RollbackModal
                    deployment={rollbackDeployment}
                    isOpen={!!rollbackDeployment}
                    onClose={() => setRollbackDeployment(null)}
                    onConfirm={confirmRollback}
                />
            )}
        </div>
    );
}
