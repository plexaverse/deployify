'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, Trash2, Settings, Terminal, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Button as MovingBorderButton } from '@/components/ui/moving-border';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { SegmentedControl } from '@/components/ui/segmented-control';
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
        newEnvIsSecret, setNewEnvIsSecret,
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
        } else if (framework === 'remix' || framework === 'sveltekit') {
            setBuildCommand('npm run build');
            setOutputDirectory('build');
            setInstallCommand('npm install');
        } else if (framework === 'nuxt') {
            setBuildCommand('npm run build');
            setOutputDirectory('.output');
            setInstallCommand('npm install');
        } else if (framework === 'bun') {
            setBuildCommand('bun run build');
            setOutputDirectory('dist');
            setInstallCommand('bun install');
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

        setEnvVars([...envVars, { key, value: newEnvValue, target: newEnvTarget, isSecret: newEnvIsSecret }]);
        setNewEnvKey('');
        setNewEnvValue('');
        setNewEnvTarget('both');
        setNewEnvIsSecret(false);
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
                        isSecret: e.isSecret
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
        <div className="p-8 max-w-4xl mx-auto pb-24">
            <Link
                href="/dashboard/new"
                className="inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] mb-8 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to Git Repositories
            </Link>

            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-2 text-[var(--foreground)]">Configure Project</h1>
                <p className="text-[var(--muted-foreground)]">
                    Deploying <strong className="text-[var(--foreground)]">{repoFullName}</strong>
                </p>
            </div>

            <div className="space-y-8">
                {/* General Settings */}
                <Card className="p-6 space-y-6">
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
                            <Label className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Project Name</Label>
                            <Input
                                type="text"
                                value={projectName}
                                onChange={(e) => setProjectName(e.target.value)}
                                placeholder="my-project"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Framework Preset</Label>
                            <NativeSelect
                                value={framework}
                                onChange={(e) => setFramework(e.target.value)}
                            >
                                <option value="auto">Auto-detect</option>
                                <option value="nextjs">Next.js</option>
                                <option value="vite">Vite (React, Vue, Svelte)</option>
                                <option value="astro">Astro</option>
                                <option value="remix">Remix</option>
                                <option value="nuxt">Nuxt</option>
                                <option value="sveltekit">SvelteKit</option>
                                <option value="bun">Bun</option>
                                <option value="docker">Docker (Custom Dockerfile)</option>
                            </NativeSelect>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Root Directory</Label>
                            <Input
                                type="text"
                                value={rootDirectory}
                                onChange={(e) => setRootDirectory(e.target.value)}
                                placeholder="./"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Region</Label>
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
                <Card className="p-6 space-y-6">
                    <div className="flex items-center gap-4 pb-4 border-b border-[var(--border)]">
                        <div className="w-12 h-12 rounded-lg bg-[var(--primary-bg)]/10 text-[var(--primary)] flex items-center justify-center border border-[var(--primary)]/30">
                            <Settings className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-[var(--foreground)]">Build Settings</h2>
                            <p className="text-[var(--muted-foreground)] text-sm">Customize your build pipeline</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Build Command</Label>
                            <Input
                                type="text"
                                value={buildCommand}
                                onChange={(e) => setBuildCommand(e.target.value)}
                                placeholder="npm run build"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Output Directory</Label>
                            <Input
                                type="text"
                                value={outputDirectory}
                                onChange={(e) => setOutputDirectory(e.target.value)}
                                placeholder=".next"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Install Command</Label>
                        <Input
                            type="text"
                            value={installCommand}
                            onChange={(e) => setInstallCommand(e.target.value)}
                            placeholder="npm install"
                        />
                    </div>
                </Card>

                {/* Environment Variables */}
                <Card className="p-6 space-y-6">
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
                                <div className="flex-1 grid grid-cols-3 gap-4 items-center">
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
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleRemoveEnv(env.key)}
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
                                value={newEnvKey}
                                onChange={(e) => setNewEnvKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
                                placeholder="KEY"
                                className="font-mono"
                            />
                            <Input
                                type={newEnvIsSecret ? 'password' : 'text'}
                                value={newEnvValue}
                                onChange={(e) => setNewEnvValue(e.target.value)}
                                placeholder="VALUE"
                                className="font-mono"
                            />
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleAddEnv}
                                disabled={!newEnvKey || !newEnvValue}
                                className="text-[var(--primary)] px-4"
                            >
                                <Plus className="w-5 h-5 mr-2" /> Add
                            </Button>
                        </div>

                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border)] bg-[var(--card)]/50">
                                <Switch
                                    id="is-secret"
                                    checked={newEnvIsSecret}
                                    onCheckedChange={setNewEnvIsSecret}
                                />
                                <Label htmlFor="is-secret" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                                    <Shield className="w-3.5 h-3.5 text-[var(--info)]" />
                                    Secret (Encrypted)
                                </Label>
                            </div>

                            <div className="space-y-2 flex-1 max-w-xs">
                                <span className="text-[10px] uppercase font-bold text-[var(--muted-foreground)] tracking-wider block">Target Environment</span>
                                <SegmentedControl
                                    value={newEnvTarget}
                                    onChange={(val) => setNewEnvTarget(val as 'both' | 'build' | 'runtime')}
                                    options={[
                                        { value: 'both', label: 'Both' },
                                        { value: 'build', label: 'Build' },
                                        { value: 'runtime', label: 'Runtime' },
                                    ]}
                                />
                            </div>
                        </div>
                    </div>
                </Card>

                <div className="flex justify-end pt-4">
                    <MovingBorderButton
                        onClick={handleDeploy}
                        disabled={isDeploying || !projectName}
                        containerClassName="h-14 w-full md:w-48"
                        className="text-base font-bold shadow-[var(--primary-glow)]"
                    >
                        {isDeploying ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                Deploying...
                            </>
                        ) : (
                            'Deploy'
                        )}
                    </MovingBorderButton>
                </div>
            </div>
        </div>
    );
}
