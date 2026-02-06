'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft, Search, Lock, Globe, Loader2, GitBranch, X,
    Settings, Terminal, Plus, Trash2, CheckCircle2, AlertCircle, ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

import { BackgroundBeams } from '@/components/ui/background-beams';
import type { GitHubRepo, Project, Deployment } from '@/types';

// Common GCP regions
const GCP_REGIONS = [
    { value: '', label: 'Default region' },
    { value: 'us-central1', label: 'Iowa (us-central1)' },
    { value: 'us-east1', label: 'South Carolina (us-east1)' },
    { value: 'europe-west1', label: 'Belgium (europe-west1)' },
    { value: 'europe-west2', label: 'London (europe-west2)' },
    { value: 'asia-east1', label: 'Taiwan (asia-east1)' },
    { value: 'asia-northeast1', label: 'Tokyo (asia-northeast1)' },
    { value: 'asia-southeast1', label: 'Singapore (asia-southeast1)' },
    { value: 'asia-south1', label: 'Mumbai (asia-south1)' },
    { value: 'australia-southeast1', label: 'Sydney (australia-southeast1)' },
];

export default function NewProjectPage() {
    const router = useRouter();
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
    const [project, setProject] = useState<Project | null>(null);
    const [deployment, setDeployment] = useState<Deployment | null>(null);

    // Step 2 State (lifted up to persist between step switches if needed, mostly for Step 3 access)
    // Actually better to keep Step 2 state inside Step 2, but we need project/deployment for Step 3.
    // So project and deployment are lifted.

    const handleRepoSelect = (repo: GitHubRepo) => {
        setSelectedRepo(repo);
        setStep(2);
        toast.success(`Selected ${repo.full_name}`);
    };

    const handleDeploymentStarted = (proj: Project, deploy: Deployment) => {
        setProject(proj);
        setDeployment(deploy);
        setStep(3);
    };

    return (
        <div className="min-h-screen w-full bg-black/[0.96] antialiased bg-grid-white/[0.02] relative overflow-hidden">
            <BackgroundBeams className="opacity-40" />

            <div className="relative z-10 container mx-auto px-4 py-8 max-w-5xl h-screen flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/dashboard"
                            className="p-2 rounded-full hover:bg-white/10 transition-colors text-white/70 hover:text-white"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-neutral-200 to-neutral-500">
                            Create Project
                        </h1>
                    </div>

                    {/* Stepper Indicator */}
                    <div className="flex items-center gap-2 text-sm">
                        <StepIndicator current={step} number={1} label="Select" />
                        <div className="w-8 h-[1px] bg-white/10" />
                        <StepIndicator current={step} number={2} label="Configure" />
                        <div className="w-8 h-[1px] bg-white/10" />
                        <StepIndicator current={step} number={3} label="Deploy" />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    <AnimatePresence mode="wait">
                        {step === 1 && (
                            <Step1SelectRepo key="step1" onSelect={handleRepoSelect} />
                        )}
                        {step === 2 && selectedRepo && (
                            <Step2Configure
                                key="step2"
                                repo={selectedRepo}
                                onBack={() => setStep(1)}
                                onDeploy={handleDeploymentStarted}
                            />
                        )}
                        {step === 3 && project && deployment && (
                            <Step3Deploy
                                key="step3"
                                project={project}
                                initialDeployment={deployment}
                            />
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}

function StepIndicator({ current, number, label }: { current: number, number: number, label: string }) {
    const active = current >= number;
    const currentStep = current === number;

    return (
        <div className={`flex items-center gap-2 ${active ? 'text-white' : 'text-white/40'}`}>
            <div className={`
                w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border
                ${active
                    ? 'bg-white text-black border-white'
                    : 'bg-transparent border-white/20'
                }
                ${currentStep ? 'ring-2 ring-white/20 ring-offset-2 ring-offset-black' : ''}
            `}>
                {active && current > number ? <CheckCircle2 className="w-3.5 h-3.5" /> : number}
            </div>
            <span>{label}</span>
        </div>
    );
}

// ----------------------------------------------------------------------
// Step 1: Select Repository
// ----------------------------------------------------------------------

function Step1SelectRepo({ onSelect }: { onSelect: (repo: GitHubRepo) => void }) {
    const [repos, setRepos] = useState<GitHubRepo[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchRepos() {
            try {
                const response = await fetch('/api/repos');
                const data = await response.json();

                if (data.error) {
                    setError(data.error);
                    toast.error(data.error);
                } else {
                    setRepos(data.repos || []);
                }
            } catch (err) {
                setError('Failed to fetch repositories');
                toast.error('Failed to fetch repositories');
            } finally {
                setLoading(false);
            }
        }

        fetchRepos();
    }, []);

    const filteredRepos = repos.filter(repo =>
        repo.full_name.toLowerCase().includes(search.toLowerCase()) ||
        repo.description?.toLowerCase().includes(search.toLowerCase())
    );

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        });
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-3xl mx-auto space-y-6"
        >
            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                <input
                    type="text"
                    placeholder="Search your repositories..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-12 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                    autoFocus
                />
                {search && (
                    <button
                        onClick={() => setSearch('')}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {loading ? (
                <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-24 bg-white/5 rounded-xl animate-pulse" />
                    ))}
                </div>
            ) : (
                <div className="grid gap-4">
                    {filteredRepos.map((repo) => (
                        <div
                            key={repo.id}
                            onClick={() => onSelect(repo)}
                            className="group relative bg-white/5 border border-white/10 hover:border-indigo-500/50 hover:bg-white/[0.07] rounded-xl p-4 transition-all cursor-pointer"
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-black/40 flex items-center justify-center border border-white/10">
                                        {repo.private ? (
                                            <Lock className="w-5 h-5 text-amber-400/80" />
                                        ) : (
                                            <Globe className="w-5 h-5 text-emerald-400/80" />
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="font-medium text-white group-hover:text-indigo-400 transition-colors flex items-center gap-2">
                                            {repo.full_name}
                                            {repo.private && (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                                    Private
                                                </span>
                                            )}
                                        </h3>
                                        <p className="text-sm text-white/50 mt-1 line-clamp-1">
                                            {repo.description || 'No description'}
                                        </p>
                                        <div className="flex items-center gap-4 mt-3 text-xs text-white/40">
                                            {repo.language && (
                                                <span className="flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-full bg-indigo-500" />
                                                    {repo.language}
                                                </span>
                                            )}
                                            <span className="flex items-center gap-1">
                                                <GitBranch className="w-3 h-3" />
                                                {repo.default_branch}
                                            </span>
                                            <span>Updated {formatDate(repo.updated_at)}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity self-center pr-2">
                                    <ChevronRight className="w-5 h-5 text-white/40" />
                                </div>
                            </div>
                        </div>
                    ))}

                    {filteredRepos.length === 0 && (
                        <div className="text-center py-12 text-white/40">
                            <p>No repositories found matching your search.</p>
                        </div>
                    )}
                </div>
            )}
        </motion.div>
    );
}

// ----------------------------------------------------------------------
// Step 2: Configure Project
// ----------------------------------------------------------------------

function Step2Configure({ repo, onBack, onDeploy }: {
    repo: GitHubRepo,
    onBack: () => void,
    onDeploy: (project: Project, deployment: Deployment) => void
}) {
    const [projectName, setProjectName] = useState(repo.name);
    const [framework, setFramework] = useState('auto');
    const [rootDirectory, setRootDirectory] = useState('');
    const [region, setRegion] = useState('');
    const [deploying, setDeploying] = useState(false);

    // Env Vars
    const [envVars, setEnvVars] = useState<{ key: string; value: string; target: 'both' | 'build' | 'runtime' }[]>([]);
    const [newEnvKey, setNewEnvKey] = useState('');
    const [newEnvValue, setNewEnvValue] = useState('');
    const [newEnvTarget, setNewEnvTarget] = useState<'both' | 'build' | 'runtime'>('both');

    const handleAddEnv = () => {
        if (!newEnvKey.trim() || !newEnvValue.trim()) return;
        const key = newEnvKey.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
        if (envVars.some(e => e.key === key)) {
            toast.error('Variable already exists');
            return;
        }
        setEnvVars([...envVars, { key, value: newEnvValue, target: newEnvTarget }]);
        setNewEnvKey('');
        setNewEnvValue('');
    };

    const handleDeploy = async () => {
        if (!projectName) return;
        setDeploying(true);
        const toastId = toast.loading('Creating project...');

        try {
            // 1. Create Project
            const createRes = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    repoFullName: repo.full_name,
                    name: projectName,
                    framework,
                    rootDirectory,
                    region: region || undefined,
                    envVariables: envVars.map(e => ({
                        key: e.key,
                        value: e.value,
                        target: e.target,
                        isSecret: false
                    }))
                }),
            });

            const createData = await createRes.json();
            if (!createRes.ok) throw new Error(createData.error || 'Failed to create project');

            const newProject = createData.project;
            toast.success('Project created!', { id: toastId });

            // 2. Trigger Deployment
            const deployToastId = toast.loading('Starting deployment...');
            const deployRes = await fetch(`/api/projects/${newProject.id}/deploy`, {
                method: 'POST',
            });

            const deployData = await deployRes.json();
            if (!deployRes.ok) throw new Error(deployData.error || 'Failed to start deployment');

            toast.success('Deployment started!', { id: deployToastId });
            onDeploy(newProject, deployData.deployment);

        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : 'Something went wrong');
            setDeploying(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="max-w-3xl mx-auto space-y-6 pb-20"
        >
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-6">
                <div className="flex items-center gap-4 pb-4 border-b border-white/10">
                    <div className="w-12 h-12 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                        <Settings className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-white">Project Settings</h2>
                        <p className="text-white/40 text-sm">Configure your deployment environment</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-white/60 uppercase tracking-wider">Project Name</label>
                        <input
                            type="text"
                            value={projectName}
                            onChange={(e) => setProjectName(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:border-indigo-500 focus:outline-none transition-colors"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-white/60 uppercase tracking-wider">Framework</label>
                        <select
                            value={framework}
                            onChange={(e) => setFramework(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:border-indigo-500 focus:outline-none transition-colors appearance-none"
                        >
                            <option value="auto">Auto-detect</option>
                            <option value="nextjs">Next.js</option>
                            <option value="vite">Vite</option>
                            <option value="astro">Astro</option>
                            <option value="remix">Remix</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-white/60 uppercase tracking-wider">Root Directory</label>
                        <input
                            type="text"
                            value={rootDirectory}
                            onChange={(e) => setRootDirectory(e.target.value)}
                            placeholder="./"
                            className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:border-indigo-500 focus:outline-none transition-colors"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-white/60 uppercase tracking-wider">Region</label>
                        <select
                            value={region}
                            onChange={(e) => setRegion(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:border-indigo-500 focus:outline-none transition-colors appearance-none"
                        >
                            {GCP_REGIONS.map((r) => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-6">
                <div className="flex items-center gap-4 pb-4 border-b border-white/10">
                    <div className="w-12 h-12 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                        <Terminal className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-white">Environment Variables</h2>
                        <p className="text-white/40 text-sm">Add build and runtime variables</p>
                    </div>
                </div>

                <div className="space-y-3">
                    {envVars.map((env) => (
                        <div key={env.key} className="flex items-center gap-2 p-3 rounded-lg bg-black/40 border border-white/10">
                            <div className="flex-1 grid grid-cols-3 gap-4">
                                <span className="font-mono text-sm text-indigo-400">{env.key}</span>
                                <span className="font-mono text-sm text-white/70 truncate">{env.value}</span>
                                <span className="text-xs text-white/40 uppercase">{env.target}</span>
                            </div>
                            <button onClick={() => setEnvVars(envVars.filter(e => e.key !== env.key))} className="text-white/40 hover:text-red-400">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>

                <div className="flex gap-2 p-4 bg-black/20 rounded-lg border border-white/5">
                    <input
                        type="text"
                        placeholder="KEY"
                        value={newEnvKey}
                        onChange={(e) => setNewEnvKey(e.target.value)}
                        className="flex-1 bg-transparent border-b border-white/20 px-2 py-1 text-sm font-mono text-white focus:border-indigo-500 focus:outline-none"
                    />
                    <input
                        type="text"
                        placeholder="VALUE"
                        value={newEnvValue}
                        onChange={(e) => setNewEnvValue(e.target.value)}
                        className="flex-1 bg-transparent border-b border-white/20 px-2 py-1 text-sm font-mono text-white focus:border-indigo-500 focus:outline-none"
                    />
                    <select
                        value={newEnvTarget}
                        onChange={(e) => setNewEnvTarget(e.target.value as any)}
                        className="bg-transparent text-white/60 text-xs focus:outline-none border-b border-white/20"
                    >
                        <option value="both">Both</option>
                        <option value="build">Build</option>
                        <option value="runtime">Runtime</option>
                    </select>
                    <button
                        onClick={handleAddEnv}
                        disabled={!newEnvKey || !newEnvValue}
                        className="p-1 hover:bg-white/10 rounded-md disabled:opacity-50 text-indigo-400"
                    >
                        <Plus className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div className="flex justify-between items-center pt-4">
                <button
                    onClick={onBack}
                    className="text-white/50 hover:text-white transition-colors"
                >
                    Back to Select
                </button>
                <button
                    onClick={handleDeploy}
                    disabled={deploying || !projectName}
                    className="bg-white text-black hover:bg-neutral-200 px-8 py-3 rounded-full font-semibold transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {deploying ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                    {deploying ? 'Deploying...' : 'Deploy Project'}
                </button>
            </div>
        </motion.div>
    );
}

// ----------------------------------------------------------------------
// Step 3: Deployment Logs
// ----------------------------------------------------------------------

function Step3Deploy({ project, initialDeployment }: { project: Project, initialDeployment: Deployment }) {
    const router = useRouter();
    const [status, setStatus] = useState<string>(initialDeployment.status);
    const [logs, setLogs] = useState<string>('Initializing build environment...');
    const [error, setError] = useState<string | null>(null);
    const logsEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Poll status and logs
        const interval = setInterval(async () => {
            if (['ready', 'error', 'cancelled'].includes(status)) {
                clearInterval(interval);
                return;
            }

            try {
                const [statusRes, logsRes] = await Promise.all([
                    fetch(`/api/projects/${project.id}/deployments/${initialDeployment.id}`),
                    fetch(`/api/projects/${project.id}/deployments/${initialDeployment.id}/logs`)
                ]);

                if (statusRes.ok) {
                    const statusData = await statusRes.json();
                    if (statusData.deployment) {
                        setStatus(statusData.deployment.status);
                        if (statusData.deployment.errorMessage) {
                            setError(statusData.deployment.errorMessage);
                        }
                    }
                }

                if (logsRes.ok) {
                    const logsData = await logsRes.json();
                    if (logsData.logs) {
                         setLogs(logsData.logs);
                    }
                }
            } catch (e) {
                console.error('Polling error', e);
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [project.id, initialDeployment.id, status]);

    useEffect(() => {
        // Auto-scroll to bottom of logs
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    const isReady = status === 'ready';
    const isError = status === 'error' || status === 'cancelled';

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-4xl mx-auto h-[600px] flex flex-col gap-6"
        >
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-3">
                        {isReady ? (
                            <span className="text-emerald-400 flex items-center gap-2">
                                <CheckCircle2 className="w-6 h-6" /> Deployed Successfully
                            </span>
                        ) : isError ? (
                            <span className="text-red-400 flex items-center gap-2">
                                <AlertCircle className="w-6 h-6" /> Deployment Failed
                            </span>
                        ) : (
                            <span className="text-indigo-400 flex items-center gap-2">
                                <Loader2 className="w-6 h-6 animate-spin" /> Building & Deploying...
                            </span>
                        )}
                    </h2>
                    <p className="text-white/40 mt-1">
                        {project.name} • {initialDeployment.gitBranch} • {initialDeployment.gitCommitSha.substring(0, 7)}
                    </p>
                </div>
                {isReady && (
                    <button
                        onClick={() => router.push(`/dashboard/${project.id}`)}
                        className="bg-white text-black hover:bg-neutral-200 px-6 py-2 rounded-full font-semibold transition-all"
                    >
                        Go to Dashboard
                    </button>
                )}
                 {isError && (
                    <button
                         onClick={() => window.location.reload()}
                        className="bg-white/10 text-white hover:bg-white/20 px-6 py-2 rounded-full font-semibold transition-all"
                    >
                        Try Again
                    </button>
                )}
            </div>

            <div className="flex-1 bg-black/80 rounded-xl border border-white/10 overflow-hidden flex flex-col font-mono text-sm shadow-2xl relative">
                <div className="bg-white/5 p-3 flex items-center gap-2 border-b border-white/5">
                    <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
                        <div className="w-3 h-3 rounded-full bg-amber-500/20 border border-amber-500/50" />
                        <div className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/50" />
                    </div>
                    <div className="ml-4 text-xs text-white/30">build-log.txt</div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-1 text-white/70">
                    {logs.split('\n').map((line, i) => (
                         <div key={i} className="break-all whitespace-pre-wrap">{line || '\u00A0'}</div>
                    ))}
                    {isError && (
                        <div className="text-red-400 mt-4 border-t border-red-500/20 pt-4">
                            <strong>Error:</strong> {error || 'Unknown error occurred during build'}
                        </div>
                    )}
                    <div ref={logsEndRef} />
                </div>

                {!isReady && !isError && (
                    <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
                )}
            </div>
        </motion.div>
    );
}
