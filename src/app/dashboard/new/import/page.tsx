'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, Trash2, MapPin, Terminal, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/moving-border';

// Common GCP regions (matching those in new/page.tsx)
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

export default function ImportProjectPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const repoFullName = searchParams.get('repo');

    const [projectName, setProjectName] = useState('');
    const [framework, setFramework] = useState('auto');
    const [rootDirectory, setRootDirectory] = useState('');
    const [buildCommand, setBuildCommand] = useState('');
    const [outputDirectory, setOutputDirectory] = useState('');
    const [installCommand, setInstallCommand] = useState('');
    const [region, setRegion] = useState('');

    // Env Vars State
    const [envVars, setEnvVars] = useState<{ key: string; value: string; target: 'both' | 'build' | 'runtime' }[]>([]);
    const [newEnvKey, setNewEnvKey] = useState('');
    const [newEnvValue, setNewEnvValue] = useState('');
    const [newEnvTarget, setNewEnvTarget] = useState<'both' | 'build' | 'runtime'>('both');

    const [deploying, setDeploying] = useState(false);

    useEffect(() => {
        if (repoFullName) {
            // Default project name to repo name (strip owner)
            const name = repoFullName.split('/')[1] || repoFullName;
            setProjectName(name);
        } else {
            router.push('/dashboard/new');
        }
    }, [repoFullName, router]);

    // Update defaults when framework changes
    useEffect(() => {
        if (framework === 'nextjs') {
            setBuildCommand('npm run build');
            setOutputDirectory('.next');
            setInstallCommand('npm install');
        } else if (framework === 'vite' || framework === 'astro') {
            setBuildCommand('npm run build');
            setOutputDirectory('dist');
            setInstallCommand('npm install');
        } else if (framework === 'remix') {
            setBuildCommand('npm run build');
            setOutputDirectory('build');
            setInstallCommand('npm install');
        }
        // 'auto' leaves them empty for auto-detection or manual input
    }, [framework]);

    const handleAddEnv = () => {
        if (!newEnvKey.trim() || !newEnvValue.trim()) return;

        // Validate key
        const key = newEnvKey.toUpperCase().replace(/[^A-Z0-9_]/g, '_');

        if (envVars.some(e => e.key === key)) {
            toast.error('Variable already exists');
            return;
        }

        setEnvVars([...envVars, { key, value: newEnvValue, target: newEnvTarget }]);
        setNewEnvKey('');
        setNewEnvValue('');
        setNewEnvTarget('both');
    };

    const handleRemoveEnv = (key: string) => {
        setEnvVars(envVars.filter(e => e.key !== key));
    };

    const handleDeploy = async () => {
        if (!repoFullName || !projectName) return;

        setDeploying(true);
        const toastId = toast.loading('Creating project...');

        try {
            const response = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    repoFullName,
                    name: projectName,
                    framework,
                    rootDirectory,
                    buildCommand,
                    outputDirectory,
                    installCommand,
                    region: region || undefined,
                    envVariables: envVars.map(e => ({
                         key: e.key,
                         value: e.value,
                         target: e.target,
                         isSecret: false // TODO: Support secrets in import flow
                    }))
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to create project');
            }

            toast.success('Project created!', { id: toastId });
            router.push(`/dashboard/${data.project.id}`);
        } catch (error) {
            console.error('Deploy error:', error);
            toast.error(error instanceof Error ? error.message : 'Failed to deploy', { id: toastId });
            setDeploying(false);
        }
    };

    if (!repoFullName) return null;

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <Link
                href="/dashboard/new"
                className="inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] mb-6"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to Git Repositories
            </Link>

            <h1 className="text-2xl font-bold mb-2">Configure Project</h1>
            <p className="text-[var(--muted-foreground)] mb-8">
                Deploying <strong>{repoFullName}</strong>
            </p>

            <div className="grid grid-cols-1 gap-6">
                {/* General Settings */}
                <div className="card">
                    <h2 className="text-lg font-semibold mb-4">Project Settings</h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Project Name</label>
                            <input
                                type="text"
                                value={projectName}
                                onChange={(e) => setProjectName(e.target.value)}
                                className="input w-full"
                                placeholder="my-project"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Framework Preset</label>
                            <select
                                value={framework}
                                onChange={(e) => setFramework(e.target.value)}
                                className="input w-full"
                            >
                                <option value="auto">Auto-detect</option>
                                <option value="nextjs">Next.js</option>
                                <option value="vite">Vite (React, Vue, Svelte)</option>
                                <option value="astro">Astro</option>
                                <option value="remix">Remix</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Root Directory</label>
                            <input
                                type="text"
                                value={rootDirectory}
                                onChange={(e) => setRootDirectory(e.target.value)}
                                className="input w-full"
                                placeholder="./"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Region</label>
                            <select
                                value={region}
                                onChange={(e) => setRegion(e.target.value)}
                                className="input w-full"
                            >
                                {GCP_REGIONS.map((r) => (
                                    <option key={r.value} value={r.value}>
                                        {r.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Build Settings */}
                <div className="card">
                    <div className="flex items-center gap-2 mb-4">
                         <Settings className="w-5 h-5 text-[var(--muted-foreground)]" />
                         <h2 className="text-lg font-semibold">Build Settings</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Build Command</label>
                            <input
                                type="text"
                                value={buildCommand}
                                onChange={(e) => setBuildCommand(e.target.value)}
                                className="input w-full"
                                placeholder="npm run build"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Output Directory</label>
                            <input
                                type="text"
                                value={outputDirectory}
                                onChange={(e) => setOutputDirectory(e.target.value)}
                                className="input w-full"
                                placeholder=".next"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Install Command</label>
                        <input
                            type="text"
                            value={installCommand}
                            onChange={(e) => setInstallCommand(e.target.value)}
                            className="input w-full"
                            placeholder="npm install"
                        />
                    </div>
                </div>

                {/* Environment Variables */}
                <div className="card">
                    <div className="flex items-center gap-2 mb-4">
                         <Terminal className="w-5 h-5 text-[var(--muted-foreground)]" />
                         <h2 className="text-lg font-semibold">Environment Variables</h2>
                    </div>

                    <div className="mb-4 space-y-2">
                         {envVars.map((env) => (
                             <div key={env.key} className="flex items-center gap-2 p-2 rounded bg-[var(--background)] border border-[var(--border)]">
                                 <div className="flex-1 grid grid-cols-3 gap-2">
                                     <div className="font-mono text-sm truncate" title={env.key}>{env.key}</div>
                                     <div className="font-mono text-sm truncate" title={env.value}>{env.value}</div>
                                     <div className="text-xs text-[var(--muted-foreground)] flex items-center">{env.target}</div>
                                 </div>
                                 <button onClick={() => handleRemoveEnv(env.key)} className="text-[var(--muted-foreground)] hover:text-red-500">
                                     <Trash2 className="w-4 h-4" />
                                 </button>
                             </div>
                         ))}
                    </div>

                    <div className="flex flex-col md:flex-row gap-2">
                        <input
                            type="text"
                            value={newEnvKey}
                            onChange={(e) => setNewEnvKey(e.target.value)}
                            placeholder="KEY"
                            className="input flex-1 font-mono text-sm"
                        />
                        <input
                            type="text"
                            value={newEnvValue}
                            onChange={(e) => setNewEnvValue(e.target.value)}
                            placeholder="Value"
                            className="input flex-1 font-mono text-sm"
                        />
                        <select
                             value={newEnvTarget}
                             onChange={(e) => setNewEnvTarget(e.target.value as any)}
                             className="input w-32 text-sm"
                        >
                             <option value="both">Both</option>
                             <option value="build">Build</option>
                             <option value="runtime">Runtime</option>
                        </select>
                        <button
                            onClick={handleAddEnv}
                            className="btn btn-secondary whitespace-nowrap"
                            disabled={!newEnvKey || !newEnvValue}
                        >
                            <Plus className="w-4 h-4" /> Add
                        </button>
                    </div>
                </div>

                <div className="flex justify-end pt-4">
                    <Button
                        onClick={handleDeploy}
                        disabled={deploying || !projectName}
                        containerClassName="h-12 w-full md:w-auto"
                        className="bg-black text-white dark:bg-slate-900 font-semibold text-base"
                    >
                        {deploying ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                Deploying...
                            </>
                        ) : (
                            'Deploy'
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
