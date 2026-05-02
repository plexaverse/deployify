'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
    Download,
    Copy,
    Check,
    FileJson,
    FileCode,
    Layout,
    Settings,
    Terminal,
    Loader2,
    LucideIcon
} from 'lucide-react';
import { ConfirmationModal } from './ui/confirmation-modal';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import type { StorageConfig } from '@/types';

interface IaCExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    storage: StorageConfig | null;
    projectId: string;
}

type ExportFormat = 'terraform' | 'kubernetes' | 'env' | 'yaml' | 'json';

export function IaCExportModal({ isOpen, onClose, storage, projectId }: IaCExportModalProps) {
    const [format, setFormat] = useState<ExportFormat>('terraform');
    const [content, setContent] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    const fetchContent = useCallback(async () => {
        if (!storage) return;
        setIsLoading(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/storage/${storage.id}/export/iac?format=${format}`);
            if (res.ok) {
                const text = await res.text();
                setContent(text);
            } else {
                toast.error('Failed to fetch IaC configuration');
            }
        } catch (e) {
            console.error('IaC fetch error:', e);
            toast.error('An error occurred while generating configuration');
        } finally {
            setIsLoading(false);
        }
    }, [projectId, storage, format]);

    useEffect(() => {
        if (isOpen && storage) {
            fetchContent();
        }
    }, [isOpen, storage, format, fetchContent]);

    const handleCopy = () => {
        navigator.clipboard.writeText(content);
        setCopied(true);
        toast.success('Configuration copied to clipboard');
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        if (!storage) return;
        const sanitizedName = storage.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
        const extension = format === 'terraform' ? 'tf' : (format === 'kubernetes' || format === 'yaml' ? 'yaml' : (format === 'env' ? 'env' : 'json'));
        const blob = new Blob([content], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `iac-${sanitizedName}.${extension}`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const formats: { value: ExportFormat; label: string; icon: LucideIcon }[] = [
        { value: 'terraform', label: 'TERRAFORM', icon: Settings },
        { value: 'kubernetes', label: 'K8S SECRET', icon: Layout },
        { value: 'env', label: '.ENV', icon: Terminal },
        { value: 'yaml', label: 'YAML', icon: FileCode },
        { value: 'json', label: 'JSON', icon: FileJson },
    ];

    return (
        <ConfirmationModal
            isOpen={isOpen}
            onClose={onClose}
            title="Infrastructure as Code Export"
            headerLabel="IaC Portability"
            icon={<FileCode className="w-5 h-5 text-[var(--primary)]" />}
            description={
                <div className="space-y-6">
                    <p className="text-[10px]">
                        Export the configuration for <strong>{storage?.name}</strong> in various standard IaC formats for use in external automation or local development.
                    </p>

                    <div className="space-y-3">
                        <label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Select Format</label>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                            {formats.map((f) => (
                                <button
                                    key={f.value}
                                    onClick={() => setFormat(f.value)}
                                    className={cn(
                                        "flex flex-col items-center justify-center p-2 rounded-xl border transition-all gap-1.5",
                                        format === f.value
                                            ? "bg-[var(--primary)]/10 border-[var(--primary)] text-[var(--primary)]"
                                            : "bg-[var(--card)] border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)]/50"
                                    )}
                                >
                                    <f.icon className="w-4 h-4" />
                                    <span className="text-[8px] font-bold uppercase">{f.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="relative group">
                        <div className="absolute right-2 top-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleCopy}
                                className="h-7 w-7 bg-[var(--card)] border border-[var(--border)]"
                            >
                                {copied ? <Check className="w-3.5 h-3.5 text-[var(--success)]" /> : <Copy className="w-3.5 h-3.5" />}
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleDownload}
                                className="h-7 w-7 bg-[var(--card)] border border-[var(--border)]"
                            >
                                <Download className="w-3.5 h-3.5" />
                            </Button>
                        </div>

                        <div className="p-4 bg-[var(--muted)]/20 border border-[var(--border)] rounded-xl font-mono text-[10px] min-h-[160px] max-h-[300px] overflow-auto custom-scrollbar">
                            {isLoading ? (
                                <div className="h-32 flex flex-col items-center justify-center gap-3">
                                    <Loader2 className="w-6 h-6 animate-spin text-[var(--primary)]" />
                                    <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Generating config...</span>
                                </div>
                            ) : (
                                <pre className="text-[var(--foreground)]/80 leading-relaxed whitespace-pre-wrap break-all">
                                    {content}
                                </pre>
                            )}
                        </div>
                    </div>

                    <div className="p-3 bg-[var(--info)]/5 border border-[var(--info)]/20 rounded-xl flex items-start gap-2">
                        <Terminal className="w-3.5 h-3.5 text-[var(--info)] shrink-0 mt-0.5" />
                        <p className="text-[8px] font-bold uppercase text-[var(--muted-foreground)] leading-relaxed">
                            NOTE: EXPORTED CONFIGURATIONS INCLUDE SENSITIVE CONNECTION STRINGS. HANDLE WITH CARE AND STORE SECURELY.
                        </p>
                    </div>
                </div>
            }
            showConfirm={false}
            cancelText="Close"
        />
    );
}
