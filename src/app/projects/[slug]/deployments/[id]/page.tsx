import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { getProjectBySlug, getDeploymentById } from '@/lib/db';
import { BackgroundBeams } from '@/components/ui/background-beams';
import { LogViewer } from '@/components/LogViewer';
import {
    ArrowLeft,
    ExternalLink,
    GitBranch,
    Clock,
    User,
    GitCommit,
    Cpu,
    Calendar,
    Box
} from 'lucide-react';

interface PageProps {
    params: Promise<{
        slug: string;
        id: string;
    }>;
}

export default async function DeploymentConsolePage({ params }: PageProps) {
    const session = await getSession();
    if (!session) {
        redirect('/login');
    }

    const { slug, id } = await params;
    const project = await getProjectBySlug(session.user.id, slug);

    if (!project) {
        notFound();
    }

    const deployment = await getDeploymentById(id);

    if (!deployment || deployment.projectId !== project.id) {
        notFound();
    }

    // Status Badge Logic
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'ready': return 'bg-green-500/10 text-green-500 border-green-500/20';
            case 'error': return 'bg-red-500/10 text-red-500 border-red-500/20';
            case 'building':
            case 'deploying': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
            default: return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
        }
    };

    const isLive = deployment.status === 'building' || deployment.status === 'deploying';

    return (
        <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden font-sans flex flex-col">
            <BackgroundBeams className="z-0 opacity-40" />

            {/* Header */}
            <header className="relative z-10 border-b border-white/10 bg-slate-950/50 backdrop-blur-sm">
                <div className="max-w-[1800px] mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href={`/projects/${slug}`}
                            className="p-2 -ml-2 hover:bg-white/5 rounded-full text-slate-400 hover:text-white transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div className="flex items-center gap-3">
                            <h1 className="font-semibold text-lg tracking-tight">Deployment Console</h1>
                            <span className="text-slate-600">/</span>
                            <div className="font-mono text-sm text-slate-400">{deployment.id.substring(0, 8)}</div>
                        </div>
                        <div className={`px-2.5 py-0.5 rounded-full text-xs font-medium border flex items-center gap-1.5 ${getStatusColor(deployment.status)}`}>
                            {isLive && (
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-current"></span>
                                </span>
                            )}
                            {deployment.status.toUpperCase()}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 rounded-full border border-white/10 text-xs font-medium text-slate-300">
                            <GitBranch className="w-3.5 h-3.5" />
                            {deployment.gitBranch}
                        </div>
                        {deployment.url && (
                            <a
                                href={deployment.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-sm font-medium transition-colors"
                            >
                                Visit <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                        )}
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="relative z-10 flex-1 overflow-hidden">
                <div className="h-full max-w-[1800px] mx-auto p-4 grid grid-cols-1 lg:grid-cols-4 gap-4">
                    {/* Log Viewer (Main) */}
                    <div className="lg:col-span-3 flex flex-col min-h-0 bg-[#0d1117] rounded-xl border border-white/10 overflow-hidden shadow-2xl">
                         {/* We pass className flex-1 to let LogViewer fill the height */}
                         <LogViewer
                            projectId={project.id}
                            revision={deployment.cloudRunRevision}
                            className="h-full border-0 rounded-none bg-transparent"
                         />
                    </div>

                    {/* Sidebar (Metadata) */}
                    <div className="lg:col-span-1 space-y-4 overflow-y-auto pr-1">
                        <div className="bg-slate-900/50 backdrop-blur border border-white/10 rounded-xl p-5 space-y-6">
                            <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Metadata</h2>

                            {/* Duration */}
                            <div className="flex items-start gap-3">
                                <div className="p-2 bg-slate-800 rounded-lg text-slate-400">
                                    <Clock className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="text-xs text-slate-500 font-medium">Build Duration</div>
                                    <div className="text-sm font-mono text-slate-200">
                                        {deployment.buildDurationMs
                                            ? `${Math.round(deployment.buildDurationMs / 1000)}s`
                                            : '—'}
                                    </div>
                                </div>
                            </div>

                            {/* Author */}
                            <div className="flex items-start gap-3">
                                <div className="p-2 bg-slate-800 rounded-lg text-slate-400">
                                    <User className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="text-xs text-slate-500 font-medium">Author</div>
                                    <div className="text-sm text-slate-200">{deployment.gitCommitAuthor}</div>
                                </div>
                            </div>

                            {/* Commit */}
                            <div className="flex items-start gap-3">
                                <div className="p-2 bg-slate-800 rounded-lg text-slate-400">
                                    <GitCommit className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="text-xs text-slate-500 font-medium">Commit</div>
                                    <div className="text-sm font-mono text-slate-200 flex items-center gap-2">
                                        {deployment.gitCommitSha.substring(0, 7)}
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1 line-clamp-2">
                                        {deployment.gitCommitMessage}
                                    </div>
                                </div>
                            </div>

                            {/* Created */}
                            <div className="flex items-start gap-3">
                                <div className="p-2 bg-slate-800 rounded-lg text-slate-400">
                                    <Calendar className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="text-xs text-slate-500 font-medium">Created</div>
                                    <div className="text-sm text-slate-200">
                                        {new Date(deployment.createdAt).toLocaleString()}
                                    </div>
                                </div>
                            </div>
                        </div>

                         <div className="bg-slate-900/50 backdrop-blur border border-white/10 rounded-xl p-5 space-y-4">
                            <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Resources</h2>

                            <div className="flex items-start gap-3">
                                <div className="p-2 bg-slate-800 rounded-lg text-slate-400">
                                    <Cpu className="w-4 h-4" />
                                </div>
                                <div className="w-full">
                                    <div className="text-xs text-slate-500 font-medium mb-2">Configuration</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="bg-slate-950/50 p-2 rounded border border-white/5">
                                            <div className="text-[10px] text-slate-500 uppercase">CPU</div>
                                            <div className="text-sm font-mono text-slate-200">
                                                {project.resources?.cpu || 1} vCPU
                                            </div>
                                        </div>
                                        <div className="bg-slate-950/50 p-2 rounded border border-white/5">
                                            <div className="text-[10px] text-slate-500 uppercase">Memory</div>
                                            <div className="text-sm font-mono text-slate-200">
                                                {project.resources?.memory || '256Mi'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <div className="p-2 bg-slate-800 rounded-lg text-slate-400">
                                    <Box className="w-4 h-4" />
                                </div>
                                <div className="w-full">
                                    <div className="text-xs text-slate-500 font-medium mb-1">Instances</div>
                                    <div className="flex items-center justify-between text-sm font-mono text-slate-200">
                                       <span>Min: {project.resources?.minInstances || 0}</span>
                                       <span>Max: {project.resources?.maxInstances || 10}</span>
                                    </div>
                                </div>
                            </div>
                         </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
