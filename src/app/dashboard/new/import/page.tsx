'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, Trash2, Settings, Terminal, Shield, Database, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { Button as MovingBorderButton } from '@/components/ui/moving-border';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Separator } from '@/components/ui/separator';
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
        storageConfigs, setStorageConfigs,
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
                    })),
                    storageConfigs: storageConfigs.map(s => ({
                        name: s.name,
                        type: s.type,
                        connectionString: s.connectionString,
                        envKey: s.envKey,
                        environment: s.environment
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
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 space-y-10">
            <div className="space-y-4">
                <Link
                    href="/dashboard/new"
                    className={cn(
                        buttonVariants({ variant: 'ghost' }),
                        "inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] hover:text-[var(--foreground)] px-0 h-auto hover:bg-transparent transition-colors"
                    )}
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Git Repositories
                </Link>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                            <Settings className="w-8 h-8 text-[var(--primary)]" />
                        </div>
                        <div className="space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Project Import</span>
                            <h1 className="text-[11px] md:text-xs font-bold tracking-tight">Configure Project</h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Repository</span>
                            <span className="text-xs font-bold truncate max-w-[200px]">{repoFullName.toUpperCase()}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-8">
                {/* General Settings */}
                <Card className="overflow-hidden p-0">
                    <div className="p-6 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--info)]/10 flex items-center justify-center shrink-0">
                            <Settings className="w-5 h-5 text-[var(--info)]" />
                        </div>
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Infrastructure</span>
                            <h2 className="text-xs font-bold">Project Settings</h2>
                        </div>
                    </div>
                    <Separator className="bg-[var(--border)]" />

                    <div className="p-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold block mb-2">Project Name</Label>
                            <Input
                                type="text"
                                value={projectName}
                                onChange={(e) => setProjectName(e.target.value)}
                                placeholder="MY-PROJECT"
                                className="placeholder:text-[10px] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold block mb-2">Framework Preset</Label>
                            <NativeSelect
                                value={framework}
                                onChange={(e) => setFramework(e.target.value)}
                            >
                                <option value="auto">AUTO-DETECT</option>
                                <option value="nextjs">NEXT.JS</option>
                                <option value="vite">VITE (REACT, VUE, SVELTE)</option>
                                <option value="astro">ASTRO</option>
                                <option value="remix">REMIX</option>
                                <option value="nuxt">NUXT</option>
                                <option value="sveltekit">SVELTEKIT</option>
                                <option value="bun">BUN</option>
                                <option value="docker">DOCKER (CUSTOM DOCKERFILE)</option>
                            </NativeSelect>
                        </div>
                    </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold block mb-2">Root Directory</Label>
                                <Input
                                    type="text"
                                    value={rootDirectory}
                                    onChange={(e) => setRootDirectory(e.target.value)}
                                    placeholder="./"
                                    className="placeholder:text-[10px] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold block mb-2">Region</Label>
                                <NativeSelect
                                    value={region}
                                    onChange={(e) => setRegion(e.target.value)}
                                >
                                    {GCP_REGIONS.map((r) => (
                                        <option key={r.value} value={r.value}>
                                            {r.label.toUpperCase()}
                                        </option>
                                    ))}
                                </NativeSelect>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Build Settings */}
                <Card className="overflow-hidden p-0">
                    <div className="p-6 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                            <Settings className="w-5 h-5 text-[var(--primary)]" />
                        </div>
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Build Pipeline</span>
                            <h2 className="text-xs font-bold">Build Settings</h2>
                        </div>
                    </div>
                    <Separator className="bg-[var(--border)]" />

                    <div className="p-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold block mb-2">Build Command</Label>
                            <Input
                                type="text"
                                value={buildCommand}
                                onChange={(e) => setBuildCommand(e.target.value)}
                                placeholder="NPM RUN BUILD"
                                className="placeholder:text-[10px] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold block mb-2">Output Directory</Label>
                            <Input
                                type="text"
                                value={outputDirectory}
                                onChange={(e) => setOutputDirectory(e.target.value)}
                                placeholder=".NEXT"
                                className="placeholder:text-[10px] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider"
                            />
                        </div>
                    </div>

                        <div className="space-y-2">
                            <Label className="text-xs font-bold block mb-2">Install Command</Label>
                            <Input
                                type="text"
                                value={installCommand}
                                onChange={(e) => setInstallCommand(e.target.value)}
                                placeholder="NPM INSTALL"
                                className="placeholder:text-[10px] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider"
                            />
                        </div>
                    </div>
                </Card>

                {/* Database Connectors */}
                <Card className="overflow-hidden p-0">
                    <div className="p-6 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                            <Database className="w-5 h-5 text-[var(--primary)]" />
                        </div>
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Infrastructure</span>
                            <h2 className="text-xs font-bold">Database Connectors</h2>
                        </div>
                    </div>
                    <Separator className="bg-[var(--border)]" />

                    <div className="p-6 space-y-6">
                        <div className="space-y-3">
                            {storageConfigs.map((config, idx) => (
                                <div key={idx} className="flex items-center gap-2 p-3 rounded-lg bg-[var(--muted)]/10 border border-[var(--border)]">
                                    <div className="flex-1 grid grid-cols-3 gap-4 items-center">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--primary)]">{config.name}</span>
                                            <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase">{config.type.replace(/-/g, ' ')}</span>
                                        </div>
                                        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--foreground)]">
                                            {config.envKey}
                                        </span>
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] px-2 py-0.5 rounded bg-[var(--muted)]/20 w-fit">
                                            {config.environment.toUpperCase()}
                                        </span>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setStorageConfigs(storageConfigs.filter((_, i) => i !== idx))}
                                        className="text-[var(--muted-foreground)] hover:text-[var(--error)]"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>

                        <div className="p-4 bg-[var(--muted)]/5 rounded-lg border border-[var(--border)] space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-bold uppercase tracking-wider">Connector Name</Label>
                                    <Input
                                        placeholder="PRIMARY DB"
                                        id="new-storage-name"
                                        className="text-[10px] font-bold uppercase tracking-wider placeholder:text-[10px] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-bold uppercase tracking-wider">Database Type</Label>
                                    <NativeSelect
                                        id="new-storage-type"
                                        className="text-[10px] font-bold uppercase tracking-wider"
                                        onChange={(e) => {
                                            const type = e.target.value;
                                            const envInput = document.getElementById('new-storage-env-key') as HTMLInputElement;
                                            if (envInput) {
                                                if (type === 'memorystore-redis') envInput.value = 'REDIS_URL';
                                                else if (type === 'mongodb-atlas') envInput.value = 'MONGODB_URI';
                                                else envInput.value = 'DATABASE_URL';
                                            }
                                        }}
                                    >
                                        <option value="cloud-sql-postgres">CLOUD SQL (POSTGRES)</option>
                                        <option value="cloud-sql-mysql">CLOUD SQL (MYSQL)</option>
                                        <option value="firestore">FIRESTORE</option>
                                        <option value="memorystore-redis">MEMORYSTORE (REDIS)</option>
                                        <option value="supabase">SUPABASE</option>
                                        <option value="mongodb-atlas">MONGODB ATLAS</option>
                                        <option value="planetscale">PLANETSCALE</option>
                                        <option value="generic">GENERIC DATABASE</option>
                                    </NativeSelect>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-bold uppercase tracking-wider">Connection String</Label>
                                    <Input
                                        type="password"
                                        placeholder="POSTGRESQL://USER:PASS@HOST:PORT/DB"
                                        id="new-storage-conn"
                                        className="text-[10px] font-bold uppercase tracking-wider font-mono placeholder:text-[10px] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-bold uppercase tracking-wider">Env Var Key</Label>
                                    <Input
                                        placeholder="DATABASE_URL"
                                        id="new-storage-env-key"
                                        defaultValue="DATABASE_URL"
                                        className="text-[10px] font-bold uppercase tracking-wider font-mono placeholder:text-[10px] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-between gap-4 pt-2">
                                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    Managed via Secret Manager
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        const name = (document.getElementById('new-storage-name') as HTMLInputElement).value;
                                        const type = (document.getElementById('new-storage-type') as HTMLSelectElement).value;
                                        const connectionString = (document.getElementById('new-storage-conn') as HTMLInputElement).value;
                                        const envKey = (document.getElementById('new-storage-env-key') as HTMLInputElement).value;

                                        if (!name || !connectionString || !envKey) {
                                            toast.error('Please fill all connector fields');
                                            return;
                                        }

                                        setStorageConfigs([...storageConfigs, {
                                            name,
                                            type,
                                            connectionString,
                                            envKey,
                                            environment: 'both'
                                        }]);

                                        // Reset fields
                                        (document.getElementById('new-storage-name') as HTMLInputElement).value = '';
                                        (document.getElementById('new-storage-conn') as HTMLInputElement).value = '';
                                    }}
                                    className="text-[var(--primary)] px-4 text-[10px] font-bold uppercase tracking-wider"
                                >
                                    <Plus className="w-5 h-5 mr-2" /> Add Connector
                                </Button>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Environment Variables */}
                <Card className="overflow-hidden p-0">
                    <div className="p-6 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--success)]/10 flex items-center justify-center shrink-0">
                            <Terminal className="w-5 h-5 text-[var(--success)]" />
                        </div>
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Configuration</span>
                            <h2 className="text-xs font-bold">Environment Variables</h2>
                        </div>
                    </div>
                    <Separator className="bg-[var(--border)]" />

                    <div className="p-6 space-y-6">
                        <div className="space-y-3">
                        {envVars.map((env) => (
                            <div key={env.key} className="flex items-center gap-2 p-3 rounded-lg bg-[var(--muted)]/10 border border-[var(--border)]">
                                <div className="flex-1 grid grid-cols-3 gap-4 items-center">
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--primary)]">{env.key}</span>
                                        {env.isSecret && <Shield className="w-3 h-3 text-[var(--info)]" />}
                                    </div>
                                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--foreground)] truncate">
                                        {env.isSecret ? '••••••••' : env.value}
                                    </span>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] px-2 py-0.5 rounded bg-[var(--muted)]/20 w-fit">
                                        {(env.target === 'both' ? 'Build & Runtime' : env.target).toUpperCase()}
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
                                className="font-mono text-[10px] font-bold uppercase tracking-wider placeholder:text-[10px] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider"
                            />
                            <Input
                                type={newEnvIsSecret ? 'password' : 'text'}
                                value={newEnvValue}
                                onChange={(e) => setNewEnvValue(e.target.value)}
                                placeholder="VALUE"
                                className="font-mono text-[10px] font-bold uppercase tracking-wider placeholder:text-[10px] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider"
                            />
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleAddEnv}
                                disabled={!newEnvKey || !newEnvValue}
                                className="text-[var(--primary)] px-4 text-[10px] font-bold uppercase tracking-wider"
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
                                <Label htmlFor="is-secret" className="text-xs font-bold cursor-pointer flex items-center gap-1.5">
                                    <Shield className="w-3.5 h-3.5 text-[var(--info)]" />
                                    Secret (Encrypted)
                                </Label>
                            </div>

                            <div className="space-y-2 flex-1 max-w-xs">
                                <Label className="text-xs font-bold block mb-2">Target Environment</Label>
                                <SegmentedControl
                                    value={newEnvTarget}
                                    onChange={(val) => setNewEnvTarget(val as 'both' | 'build' | 'runtime')}
                                    options={[
                                        { value: 'both', label: 'BOTH' },
                                        { value: 'build', label: 'BUILD' },
                                        { value: 'runtime', label: 'RUNTIME' },
                                    ]}
                                />
                            </div>
                        </div>
                    </div>
                    </div>
                </Card>

                <div className="flex justify-end pt-4">
                    <MovingBorderButton
                        onClick={handleDeploy}
                        disabled={isDeploying || !projectName}
                        containerClassName="h-14 w-full md:w-48"
                        className="text-[10px] font-bold uppercase tracking-wider shadow-[var(--primary-glow)]"
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
