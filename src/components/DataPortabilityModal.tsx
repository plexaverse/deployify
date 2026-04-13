'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
    Download,
    Upload,
    Database,
    AlertCircle,
    Loader2,
    X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Portal } from '@/components/ui/portal';
import { cn } from '@/lib/utils';
import type { StorageConfig } from '@/types';

interface DataPortabilityModalProps {
    isOpen: boolean;
    onClose: () => void;
    storage: StorageConfig | null;
    projectId: string;
}

export function DataPortabilityModal({ isOpen, onClose, storage, projectId }: DataPortabilityModalProps) {
    const [mode, setMode] = useState<'import' | 'export'>('export');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [storageUri, setStorageUri] = useState('');
    const [database, setDatabase] = useState(storage?.metadata?.defaultDb as string || '');
    const [importUser, setImportUser] = useState(storage?.type.includes('postgres') ? 'postgres' : 'root');
    const [exportDatabases, setExportDatabases] = useState<string>(storage?.metadata?.defaultDb as string || '');
    const [collections, setCollections] = useState<string>('');

    const handleAction = async () => {
        if (!storageUri || !storageUri.startsWith('gs://')) {
            toast.error('Please enter a valid GCS URI (gs://bucket/path)');
            return;
        }

        setIsSubmitting(true);
        try {
            const endpoint = mode === 'import' ? 'import' : 'export';
            const body = mode === 'import'
                ? {
                    storageUri,
                    database: storage?.type === 'firestore' ? undefined : database,
                    importUser: storage?.type === 'firestore' ? undefined : importUser,
                    collections: storage?.type === 'firestore' ? collections.split(',').map(c => c.trim()).filter(Boolean) : undefined
                  }
                : {
                    storageUri,
                    databases: storage?.type === 'firestore' ? undefined : exportDatabases.split(',').map(d => d.trim()).filter(Boolean),
                    collections: storage?.type === 'firestore' ? collections.split(',').map(c => c.trim()).filter(Boolean) : undefined
                  };

            const response = await fetch(`/api/projects/${projectId}/storage/${storage?.id}/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const data = await response.json();
            if (data.success) {
                toast.success(`${mode === 'import' ? 'Import' : 'Export'} operation started successfully`);
                onClose();
            } else {
                toast.error(data.error || `Failed to start ${mode} operation`);
            }
        } catch (error) {
            console.error(`Storage ${mode} error:`, error);
            toast.error(`An error occurred while starting the ${mode} operation`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen || !storage) return null;

    return (
        <Portal>
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-fade-in">
                <div className="bg-[var(--card)] border border-[var(--border)] w-full max-w-[500px] rounded-xl shadow-2xl flex flex-col overflow-hidden animate-fade-in">
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-[var(--border)] bg-[var(--background)] shrink-0">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                                {mode === 'export' ? <Download className="w-5 h-5 text-[var(--primary)]" /> : <Upload className="w-5 h-5 text-[var(--primary)]" />}
                            </div>
                            <div className="space-y-0.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                    Managed Portability
                                </span>
                                <h3 className="text-xs font-bold tracking-tight text-[var(--foreground)] uppercase">
                                    {mode === 'export' ? 'Export Database' : 'Import Data'}
                                </h3>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="h-8 w-8 rounded-full"
                        >
                            <X className="w-5 h-5" />
                        </Button>
                    </div>

                    <div className="p-6 overflow-y-auto">
                        <div className="flex gap-1 bg-[var(--muted)]/20 p-1 rounded-xl border border-[var(--border)] mb-6">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setMode('export')}
                                className={cn(
                                    "flex-1 h-8 text-[10px] font-bold uppercase tracking-wider",
                                    mode === 'export' ? "bg-[var(--background)] shadow-sm text-[var(--primary)]" : "text-[var(--muted-foreground)]"
                                )}
                            >
                                <Download className="w-3.5 h-3.5 mr-1.5" />
                                Export
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setMode('import')}
                                className={cn(
                                    "flex-1 h-8 text-[10px] font-bold uppercase tracking-wider",
                                    mode === 'import' ? "bg-[var(--background)] shadow-sm text-[var(--primary)]" : "text-[var(--muted-foreground)]"
                                )}
                            >
                                <Upload className="w-3.5 h-3.5 mr-1.5" />
                                Import
                            </Button>
                        </div>

                        <div className="space-y-6">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                    {storage.type === 'firestore' ? 'GCS URI Prefix' : 'GCS Storage URI'}
                                </Label>
                                <Input
                                    value={storageUri}
                                    onChange={(e) => setStorageUri(e.target.value)}
                                    placeholder={storage.type === 'firestore' ? "GS://BUCKET-NAME/PREFIX" : storage.type === 'memorystore-redis' ? "GS://BUCKET-NAME/PATH/TO/DUMP.RDB" : "GS://BUCKET-NAME/PATH/TO/DUMP.SQL"}
                                    className="font-mono text-xs placeholder:text-[10px] placeholder:font-bold placeholder:uppercase"
                                />
                                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] flex items-center gap-1.5">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    Must be a Cloud Storage URI starting with <code className="text-[var(--primary)]">gs://</code>
                                </p>
                            </div>

                            {storage.type === 'firestore' ? (
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Collections to {mode === 'import' ? 'Import' : 'Export'} (CSV)</Label>
                                    <Input
                                        value={collections}
                                        onChange={(e) => setCollections(e.target.value)}
                                        placeholder="USERS, POSTS"
                                        className="font-mono text-xs uppercase"
                                    />
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]/60">
                                        LEAVE BLANK TO {mode === 'import' ? 'IMPORT' : 'EXPORT'} ALL COLLECTIONS.
                                    </p>
                                </div>
                            ) : (
                                mode === 'import' ? (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Target Database</Label>
                                            <Input
                                                value={database}
                                                onChange={(e) => setDatabase(e.target.value)}
                                                placeholder="POSTGRES"
                                                className="font-mono text-xs uppercase"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Import User</Label>
                                            <Input
                                                value={importUser}
                                                onChange={(e) => setImportUser(e.target.value)}
                                                placeholder={storage.type.includes('postgres') ? 'POSTGRES' : 'ROOT'}
                                                className="font-mono text-xs uppercase"
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Databases to Export (CSV)</Label>
                                        <Input
                                            value={exportDatabases}
                                            onChange={(e) => setExportDatabases(e.target.value)}
                                            placeholder="DB1, DB2"
                                            className="font-mono text-xs uppercase"
                                        />
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]/60">
                                            LEAVE BLANK TO EXPORT ALL DATABASES.
                                        </p>
                                    </div>
                                )
                            )}

                            {storage.type === 'memorystore-redis' && (
                                <div className="p-3 bg-[var(--warning)]/10 border border-[var(--warning)]/20 rounded-xl flex items-start gap-3">
                                    <AlertCircle className="w-4 h-4 text-[var(--warning)] shrink-0 mt-0.5" />
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--warning)] leading-relaxed">
                                        REDIS {mode === 'import' ? 'IMPORT' : 'EXPORT'} WILL MOMENTARILY DISABLE THE INSTANCE WHILE PROCESSING THE RDB FILE.
                                    </p>
                                </div>
                            )}

                            <div className="p-4 bg-[var(--info-bg)] border border-[var(--info)]/20 rounded-xl flex items-start gap-3">
                                <Database className="w-4 h-4 text-[var(--info)] shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--info)]">Permissions Required</p>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] leading-relaxed">
                                        THE {storage.type === 'firestore' ? 'SERVICE ACCOUNT' : storage.type === 'memorystore-redis' ? 'REDIS SERVICE AGENT' : 'CLOUD SQL SERVICE ACCOUNT'} MUST HAVE <code className="text-[var(--primary)]">ROLES/STORAGEMANAGER.OBJECTADMIN</code> PERMISSION ON THE TARGET BUCKET.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-[var(--border)] bg-[var(--background)] flex justify-between items-center gap-4 shrink-0">
                        <Button
                            variant="ghost"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="text-[10px] font-bold uppercase tracking-wider"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleAction}
                            disabled={isSubmitting || !storageUri}
                            className="bg-[var(--primary)] text-white text-[10px] font-bold uppercase tracking-wider h-10 px-6"
                        >
                            {isSubmitting ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : mode === 'export' ? (
                                <Download className="w-4 h-4 mr-2" />
                            ) : (
                                <Upload className="w-4 h-4 mr-2" />
                            )}
                            {mode === 'export' ? 'Start Export' : 'Start Import'}
                        </Button>
                    </div>
                </div>
            </div>
        </Portal>
    );
}
