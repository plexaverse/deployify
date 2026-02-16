'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, Trash2, Settings, Terminal } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { useStore } from '@/store';

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

    const {
        projectName, setProjectName,
        framework, setFramework,
        rootDirectory, setRootDirectory,
        buildCommand, setBuildCommand,
        outputDirectory, setOutputDirectory,
        installCommand, setInstallCommand,
        region, setRegion,
        envVars, setEnvVars,
        newEnvKey, setNewEnvKey,
        newEnvValue, setNewEnvValue,
        newEnvTarget, setNewEnvTarget,
        isDeploying, setDeploying,
        resetImportState
    } = useStore();

    useEffect(() => {
        return () => {
            resetImportState();
        };
    }, [resetImportState]);

    useEffect(() => {
        if (repoFullName) {
            // Default project name to repo name (strip owner)
            const name = repoFullName.split('/')[1] || repoFullName;
            setProjectName(name);
        } else {
            router.push('/dashboard/new');
        }
    }, [repoFullName, router, setProjectName]);

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
        } else if (framework === 'docker') {
            setBuildCommand('');
            setOutputDirectory('');
            setInstallCommand('');
        }
        // 'auto' leaves them empty for auto-detection or manual input
    }, [framework, setBuildCommand, setOutputDirectory, setInstallCommand]);

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
                className="inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] mb-6 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to Git Repositories
            </Link>

            <h1 className="text-2xl font-bold mb-2 text-[var(--foreground)]">Configure Project</h1>
            <p className="text-[var(--muted-foreground)] mb-8">
                Deploying <strong className="text-[var(--foreground)]">{repoFullName}</strong>
            </p>

            <div className="grid grid-cols-1 gap-6">
                {/* General Settings */}
                <Card>
                    <h2 className="text-lg font-semibold mb-4 text-[var(--foreground)]">Project Settings</h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className="space-y-2">
                            <Label>Project Name</Label>
                            <Input
                                type="text"
                                value={projectName}
                                onChange={(e) => setProjectName(e.target.value)}
                                placeholder="my-project"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Framework Preset</Label>
                            <NativeSelect
                                value={framework}
                                onChange={(e) => setFramework(e.target.value)}
                            >
                                <option value="auto">Auto-detect</option>
                                <option value="nextjs">Next.js</option>
                                <option value="vite">Vite (React, Vue, Svelte)</option>
                                <option value="astro">Astro</option>
                                <option value="remix">Remix</option>
                                <option value="docker">Docker (Custom Dockerfile)</option>
                            </NativeSelect>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Root Directory</Label>
                            <Input
                                type="text"
                                value={rootDirectory}
                                onChange={(e) => setRootDirectory(e.target.value)}
                                placeholder="./"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Region</Label>
                            <NativeSelect
                                value={region}
                                onChange={(e) => setRegion(e.target.value)}
                            >
                                {GCP_REGIONS.map((r) => (
                                    <option key={r.value} value={r.value}>
                                        {r.label}
                                    </option>
                                ))}
                            </NativeSelect>
                        </div>
                    </div>
                </Card>

                {/* Build Settings */}
                <Card>
                    <div className="flex items-center gap-2 mb-4">
                        <Settings className="w-5 h-5 text-[var(--muted-foreground)]" />
                        <h2 className="text-lg font-semibold text-[var(--foreground)]">Build Settings</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className="space-y-2">
                            <Label>Build Command</Label>
                            <Input
                                type="text"
                                value={buildCommand}
                                onChange={(e) => setBuildCommand(e.target.value)}
                                placeholder="npm run build"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Output Directory</Label>
                            <Input
                                type="text"
                                value={outputDirectory}
                                onChange={(e) => setOutputDirectory(e.target.value)}
                                placeholder=".next"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Install Command</Label>
                        <Input
                            type="text"
                            value={installCommand}
                            onChange={(e) => setInstallCommand(e.target.value)}
                            placeholder="npm install"
                        />
                    </div>
                </Card>

                {/* Environment Variables */}
                <Card>
                    <div className="flex items-center gap-2 mb-4">
                        <Terminal className="w-5 h-5 text-[var(--muted-foreground)]" />
                        <h2 className="text-lg font-semibold text-[var(--foreground)]">Environment Variables</h2>
                    </div>

                    <div className="mb-4 space-y-2">
                        {envVars.map((env) => (
                            <div key={env.key} className="flex items-center gap-2 p-2 rounded bg-[var(--background)] border border-[var(--border)]">
                                <div className="flex-1 grid grid-cols-3 gap-2">
                                    <div className="font-mono text-sm truncate text-[var(--foreground)]" title={env.key}>{env.key}</div>
                                    <div className="font-mono text-sm truncate text-[var(--muted-foreground)]" title={env.value}>{env.value}</div>
                                    <div className="text-xs text-[var(--muted-foreground)] flex items-center">{env.target}</div>
                                </div>
                                <button onClick={() => handleRemoveEnv(env.key)} className="text-[var(--muted-foreground)] hover:text-red-500 transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-col md:flex-row gap-2">
                        <Input
                            type="text"
                            value={newEnvKey}
                            onChange={(e) => setNewEnvKey(e.target.value)}
                            placeholder="KEY"
                            className="flex-1 font-mono text-sm"
                        />
                        <Input
                            type="text"
                            value={newEnvValue}
                            onChange={(e) => setNewEnvValue(e.target.value)}
                            placeholder="Value"
                            className="flex-1 font-mono text-sm"
                        />
                        <NativeSelect
                            value={newEnvTarget}
                            onChange={(e) => setNewEnvTarget(e.target.value as any)}
                            className="w-32 text-sm"
                        >
                            <option value="both">Both</option>
                            <option value="build">Build</option>
                            <option value="runtime">Runtime</option>
                        </NativeSelect>
                        <Button
                            variant="secondary"
                            onClick={handleAddEnv}
                            disabled={!newEnvKey || !newEnvValue}
                        >
                            <Plus className="w-4 h-4 mr-2" /> Add
                        </Button>
                    </div>
                </Card>

                <div className="flex justify-end pt-4">
                    <Button
                        onClick={handleDeploy}
                        disabled={isDeploying || !projectName}
                        className="h-12 w-full md:w-auto text-base"
                    >
                        {isDeploying ? (
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
