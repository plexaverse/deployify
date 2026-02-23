'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft, Search, Lock, Globe, Loader2, GitBranch, X,
    Settings, Terminal, Plus, Trash2, CheckCircle2, AlertCircle, ChevronRight,
    Shield, ChevronDown, ChevronUp
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

import { BackgroundBeams } from '@/components/ui/background-beams';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Button as MovingBorderButton } from '@/components/ui/moving-border';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { BuildLogViewer } from '@/components/BuildLogViewer';
import { cn } from '@/lib/utils';
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
        <div className="min-h-screen w-full bg-[var(--background)] antialiased relative overflow-hidden">
            <BackgroundBeams className="opacity-40" />

            <div className="relative z-10 container mx-auto px-4 py-8 max-w-5xl h-screen flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/dashboard"
                            className="p-2 rounded-full hover:bg-[var(--card)] transition-colors text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <h1 className="text-2xl font-bold gradient-text">
                            Create Project
                        </h1>
                    </div>

                    {/* Stepper Indicator */}
                    <div className="flex items-center gap-2 text-sm">
                        <StepIndicator current={step} number={1} label="Select" />
                        <div className="w-8 h-[1px] bg-[var(--border)]" />
                        <StepIndicator current={step} number={2} label="Configure" />
                        <div className="w-8 h-[1px] bg-[var(--border)]" />
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
        <div className={`flex items-center gap-2 ${active ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'}`}>
            <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border transition-colors",
                active
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)]'
                    : 'bg-transparent border-[var(--border)]',
                currentStep && 'ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--background)]'
            )}>
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" />
                <Input
                    type="text"
                    placeholder="Search your repositories..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-12 pr-12 h-14"
                    autoFocus
                />
                {search && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    >
                        <X className="w-4 h-4" />
                    </Button>
                )}
            </div>

            {loading ? (
                <div className="space-y-4">
                    {[1, 2, 3, 4, 5].map(i => (
                        <Skeleton key={i} className="h-24 w-full rounded-xl" />
                    ))}
                </div>
            ) : (
                <div className="grid gap-4">
                    {filteredRepos.map((repo) => (
                        <Card
                            key={repo.id}
                            onClick={() => onSelect(repo)}
                            className="group relative hover:border-[var(--primary)] transition-all cursor-pointer p-4"
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-[var(--muted)]/20 flex items-center justify-center border border-[var(--border)]">
                                        {repo.private ? (
                                            <Lock className="w-5 h-5 text-[var(--warning)]" />
                                        ) : (
                                            <Globe className="w-5 h-5 text-[var(--success)]" />
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="font-medium text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors flex items-center gap-2">
                                            {repo.full_name}
                                            {repo.private && (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--warning-bg)] text-[var(--warning)] border border-[var(--warning)]/20">
                                                    Private
                                                </span>
                                            )}
                                        </h3>
                                        <p className="text-sm text-[var(--muted-foreground)] mt-1 line-clamp-1">
                                            {repo.description || 'No description'}
                                        </p>
                                        <div className="flex items-center gap-4 mt-3 text-xs text-[var(--muted-foreground)]">
                                            {repo.language && (
                                                <span className="flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-full bg-[var(--info)]" />
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
                                    <ChevronRight className="w-5 h-5 text-[var(--muted-foreground)]" />
                                </div>
                            </div>
                        </Card>
                    ))}

                    {filteredRepos.length === 0 && (
                        <div className="text-center py-12 text-[var(--muted-foreground)]">
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
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Advanced Settings
    const [buildCommand, setBuildCommand] = useState('');
    const [installCommand, setInstallCommand] = useState('');
    const [outputDirectory, setOutputDirectory] = useState('');

    // Env Vars
    const [envVars, setEnvVars] = useState<{
        key: string;
        value: string;
        target: 'both' | 'build' | 'runtime';
        isSecret: boolean;
        environment: 'both' | 'production' | 'preview';
    }[]>([]);
    const [newEnvKey, setNewEnvKey] = useState('');
    const [newEnvValue, setNewEnvValue] = useState('');
    const [newEnvTarget, setNewEnvTarget] = useState<'both' | 'build' | 'runtime'>('both');
    const [newEnvIsSecret, setNewEnvIsSecret] = useState(false);
    const [newEnvEnvironment, setNewEnvEnvironment] = useState<'both' | 'production' | 'preview'>('both');

    const handleAddEnv = () => {
        if (!newEnvKey.trim() || !newEnvValue.trim()) return;
        const key = newEnvKey.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
        if (envVars.some(e => e.key === key)) {
            toast.error('Variable already exists');
            return;
        }
        setEnvVars([...envVars, {
            key,
            value: newEnvValue,
            target: newEnvTarget,
            isSecret: newEnvIsSecret,
            environment: newEnvEnvironment
        }]);
        setNewEnvKey('');
        setNewEnvValue('');
        setNewEnvIsSecret(false);
        setNewEnvTarget('both');
        setNewEnvEnvironment('both');
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
                    buildCommand: buildCommand || undefined,
                    installCommand: installCommand || undefined,
                    outputDirectory: outputDirectory || undefined,
                    envVariables: envVars.map(e => ({
                        key: e.key,
                        value: e.value,
                        target: e.target,
                        isSecret: e.isSecret,
                        environment: e.environment
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
            <Card className="space-y-6">
                <div className="flex items-center gap-4 pb-4 border-b border-[var(--border)]">
                    <div className="w-12 h-12 rounded-lg bg-[var(--info-bg)] text-[var(--info)] flex items-center justify-center border border-[var(--info)]/30">
                        <Settings className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-[var(--foreground)]">Project Settings</h2>
                        <p className="text-[var(--muted-foreground)] text-sm">Configure your deployment environment</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label htmlFor="projectName" className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Project Name</label>
                        <Input
                            id="projectName"
                            type="text"
                            value={projectName}
                            onChange={(e) => setProjectName(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Framework</label>
                        <NativeSelect
                            value={framework}
                            onChange={(e) => setFramework(e.target.value)}
                        >
                            <option value="auto">Auto-detect</option>
                            <option value="nextjs">Next.js</option>
                            <option value="vite">Vite</option>
                            <option value="astro">Astro</option>
                            <option value="remix">Remix</option>
                            <option value="nuxt">Nuxt</option>
                            <option value="sveltekit">SvelteKit</option>
                            <option value="bun">Bun</option>
                            <option value="docker">Docker</option>
                        </NativeSelect>
                        {framework === 'docker' && (
                            <p className="text-xs text-[var(--info)] pt-1">
                                Deployify will use the <code>Dockerfile</code> in your repository root.
                            </p>
                        )}
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Root Directory</label>
                        <Input
                            type="text"
                            value={rootDirectory}
                            onChange={(e) => setRootDirectory(e.target.value)}
                            placeholder="./"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Region</label>
                        <NativeSelect
                            value={region}
                            onChange={(e) => setRegion(e.target.value)}
                        >
                            {GCP_REGIONS.map((r) => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                        </NativeSelect>
                    </div>
                </div>

                <div className="pt-4 border-t border-[var(--border)]">
                    <button
                        type="button"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="flex items-center gap-2 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                    >
                        {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        Advanced Build Settings
                    </button>

                    <AnimatePresence>
                        {showAdvanced && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
                                    <div className="space-y-2">
                                        <label htmlFor="buildCommand" className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Build Command</label>
                                        <Input
                                            id="buildCommand"
                                            type="text"
                                            value={buildCommand}
                                            onChange={(e) => setBuildCommand(e.target.value)}
                                            placeholder="npm run build"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label htmlFor="installCommand" className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Install Command</label>
                                        <Input
                                            id="installCommand"
                                            type="text"
                                            value={installCommand}
                                            onChange={(e) => setInstallCommand(e.target.value)}
                                            placeholder="npm install"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label htmlFor="outputDirectory" className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Output Directory</label>
                                        <Input
                                            id="outputDirectory"
                                            type="text"
                                            value={outputDirectory}
                                            onChange={(e) => setOutputDirectory(e.target.value)}
                                            placeholder=".next"
                                        />
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </Card>

            <Card className="space-y-6">
                <div className="flex items-center gap-4 pb-4 border-b border-[var(--border)]">
                    <div className="w-12 h-12 rounded-lg bg-[var(--success-bg)] text-[var(--success)] flex items-center justify-center border border-[var(--success)]/30">
                        <Terminal className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-[var(--foreground)]">Environment Variables</h2>
                        <p className="text-[var(--muted-foreground)] text-sm">Add build and runtime variables</p>
                    </div>
                </div>

                <div className="space-y-3">
                    {envVars.map((env) => (
                        <div key={env.key} className="flex items-center gap-2 p-3 rounded-lg bg-[var(--muted)]/10 border border-[var(--border)]">
                            <div className="flex-1 grid grid-cols-5 gap-4 items-center">
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-sm text-[var(--primary)]">{env.key}</span>
                                    {env.isSecret && <Shield className="w-3 h-3 text-[var(--info)]" />}
                                </div>
                                <span className="font-mono text-sm text-[var(--foreground)] truncate">
                                    {env.isSecret ? '••••••••' : env.value}
                                </span>
                                <span className="text-[10px] text-[var(--muted-foreground)] uppercase px-2 py-0.5 rounded bg-[var(--muted)]/20 w-fit">
                                    {env.target === 'both' ? 'Build & Runtime' : env.target}
                                </span>
                                <span className="text-[10px] text-[var(--muted-foreground)] uppercase px-2 py-0.5 rounded bg-[var(--muted)]/20 w-fit">
                                    {env.environment === 'both' ? 'All Envs' : env.environment}
                                </span>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setEnvVars(envVars.filter(e => e.key !== env.key))}
                                className="text-[var(--muted-foreground)] hover:text-[var(--error)]"
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                    ))}
                </div>

                <div className="space-y-4 p-4 bg-[var(--muted)]/5 rounded-lg border border-[var(--border)]">
                    <div className="flex gap-2">
                        <Input
                            type="text"
                            placeholder="KEY"
                            value={newEnvKey}
                            onChange={(e) => setNewEnvKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
                            className="font-mono"
                        />
                        <Input
                            type={newEnvIsSecret ? "password" : "text"}
                            placeholder="VALUE"
                            value={newEnvValue}
                            onChange={(e) => setNewEnvValue(e.target.value)}
                            className="font-mono"
                        />
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleAddEnv}
                            disabled={!newEnvKey || !newEnvValue}
                            className="text-[var(--primary)] px-4"
                        >
                            <Plus className="w-5 h-5 mr-2" />
                            Add
                        </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-6 pt-2">
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="isSecret"
                                checked={newEnvIsSecret}
                                onChange={(e) => setNewEnvIsSecret(e.target.checked)}
                                className="w-4 h-4 accent-[var(--primary)]"
                            />
                            <label htmlFor="isSecret" className="text-xs font-medium cursor-pointer flex items-center gap-1">
                                <Shield className="w-3 h-3" /> Secret
                            </label>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase font-bold text-[var(--muted-foreground)]">Target:</span>
                            <NativeSelect
                                value={newEnvTarget}
                                onChange={(e) => setNewEnvTarget(e.target.value as 'both' | 'build' | 'runtime')}
                                className="h-8 text-[10px] w-32 py-0"
                            >
                                <option value="both">Build & Runtime</option>
                                <option value="build">Build Only</option>
                                <option value="runtime">Runtime Only</option>
                            </NativeSelect>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase font-bold text-[var(--muted-foreground)]">Scope:</span>
                            <NativeSelect
                                value={newEnvEnvironment}
                                onChange={(e) => setNewEnvEnvironment(e.target.value as 'both' | 'production' | 'preview')}
                                className="h-8 text-[10px] w-32 py-0"
                            >
                                <option value="both">All Envs</option>
                                <option value="production">Production Only</option>
                                <option value="preview">Preview Only</option>
                            </NativeSelect>
                        </div>
                    </div>
                </div>
            </Card>

            <div className="flex justify-between items-center pt-4">
                <Button
                    variant="ghost"
                    onClick={onBack}
                    className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                >
                    Back to Select
                </Button>
                <MovingBorderButton
                    onClick={handleDeploy}
                    disabled={deploying || !projectName}
                    containerClassName="h-16 w-48"
                    className="font-bold text-base"
                >
                    {deploying ? <Loader2 className="mr-2 w-5 h-5 animate-spin" /> : null}
                    {deploying ? 'Deploying...' : 'Deploy Project'}
                </MovingBorderButton>
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
                    <h2 className="text-xl font-bold text-[var(--foreground)] flex items-center gap-3">
                        {isReady ? (
                            <span className="text-[var(--success)] flex items-center gap-2">
                                <CheckCircle2 className="w-6 h-6" /> Deployed Successfully
                            </span>
                        ) : isError ? (
                            <span className="text-[var(--error)] flex items-center gap-2">
                                <AlertCircle className="w-6 h-6" /> Deployment Failed
                            </span>
                        ) : (
                            <span className="text-[var(--info)] flex items-center gap-2">
                                <Loader2 className="w-6 h-6 animate-spin" /> Building & Deploying...
                            </span>
                        )}
                    </h2>
                    <p className="text-[var(--muted-foreground)] mt-1">
                        {project.name} • {initialDeployment.gitBranch} • {initialDeployment.gitCommitSha.substring(0, 7)}
                    </p>
                </div>
                {isReady && (
                    <Button
                        onClick={() => router.push(`/dashboard/${project.id}`)}
                        className="rounded-full px-6"
                    >
                        Go to Dashboard
                    </Button>
                )}
                 {isError && (
                    <Button
                        variant="secondary"
                        onClick={() => window.location.reload()}
                        className="rounded-full px-6"
                    >
                        Try Again
                    </Button>
                )}
            </div>

            <div className="flex-1 bg-[var(--terminal-bg)] rounded-xl border border-[var(--terminal-border)] overflow-hidden flex flex-col font-mono text-sm shadow-2xl relative">
                <div className="bg-[var(--terminal-header-bg)] p-3 flex items-center justify-between border-b border-[var(--terminal-border)]">
                    <div className="flex items-center gap-4">
                        <div className="flex gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-[var(--error)]/20 border border-[var(--error)]/50" />
                            <div className="w-3 h-3 rounded-full bg-[var(--warning)]/20 border border-[var(--warning)]/50" />
                            <div className="w-3 h-3 rounded-full bg-[var(--success)]/20 border border-[var(--success)]/50" />
                        </div>
                        <div className="flex items-center gap-2 text-[var(--terminal-foreground)]/40">
                            <Terminal className="w-3.5 h-3.5" />
                            <span className="text-xs font-medium">Build Logs</span>
                        </div>
                    </div>
                    <div className="text-[var(--terminal-foreground)]/20 text-[10px] uppercase tracking-widest font-bold">build-log.txt</div>
                </div>

                <div className="flex-1 overflow-hidden relative">
                    <BuildLogViewer
                        logs={logs}
                        loading={!isReady && !isError && !logs}
                        error={error}
                    />
                </div>

                {!isReady && !isError && (
                    <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[var(--terminal-bg)] to-transparent pointer-events-none" />
                )}
            </div>
        </motion.div>
    );
}
