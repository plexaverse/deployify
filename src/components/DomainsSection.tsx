'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Globe, CheckCircle2, Clock, XCircle, ExternalLink, Copy, Check, Loader2, ShieldCheck } from 'lucide-react';
import type { Domain } from '@/types';
import { useStore } from '@/store';

interface DomainsSectionProps {
    projectId: string;
    productionUrl?: string | null;
    onUpdate?: () => void;
}

interface DnsRecord {
    type: string;
    name: string;
    value: string;
}

export function DomainsSection({
    projectId,
    productionUrl,
    onUpdate,
}: DomainsSectionProps) {
    const {
        projectDomains: domains,
        isLoadingDomains: isLoading,
        fetchProjectDomains,
        addDomain,
        deleteDomain
    } = useStore();

    const [isAdding, setIsAdding] = useState(false);
    const [newDomain, setNewDomain] = useState('');
    const [dnsRecords, setDnsRecords] = useState<DnsRecord[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [copiedValue, setCopiedValue] = useState<string | null>(null);

    useEffect(() => {
        fetchProjectDomains(projectId);
    }, [projectId, fetchProjectDomains]);

    const copyToClipboard = async (value: string) => {
        await navigator.clipboard.writeText(value);
        setCopiedValue(value);
        setTimeout(() => setCopiedValue(null), 2000);
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'active':
                return <CheckCircle2 className="w-4 h-4 text-green-400" />;
            case 'pending':
                return <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />;
            case 'error':
                return <XCircle className="w-4 h-4 text-red-400" />;
            default:
                return <Clock className="w-4 h-4 text-gray-400" />;
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'active':
                return 'Ready';
            case 'pending':
                return 'Validating';
            case 'error':
                return 'Error';
            default:
                return status;
        }
    };

    const handleAdd = async () => {
        if (!newDomain.trim()) {
            setError('Domain is required');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const data = await addDomain(projectId, newDomain.trim());

            if (data) {
                setDnsRecords(data.dnsRecords || []);
                setNewDomain('');
                setIsAdding(false);
                setSuccess('Domain added! Configure the DNS records below.');
                if (onUpdate) onUpdate();
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to add domain');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (domainId: string, domainName: string) => {
        if (!confirm(`Are you sure you want to delete ${domainName}?`)) {
            return;
        }

        try {
            const success = await deleteDomain(projectId, domainId);
            if (success) {
                setSuccess('Domain deleted successfully');
                setTimeout(() => setSuccess(null), 3000);
                if (onUpdate) onUpdate();
            }
        } catch (err) {
            console.error('Failed to delete:', err);
        }
    };

    return (
        <div className="card">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-semibold">Domains</h2>
                    <p className="text-sm text-[var(--muted-foreground)] mt-1">
                        Configure custom domains for your deployment
                    </p>
                </div>
                {!isAdding && (
                    <button
                        onClick={() => setIsAdding(true)}
                        className="btn btn-primary"
                        disabled={isLoading}
                    >
                        <Plus className="w-4 h-4" />
                        Add Domain
                    </button>
                )}
            </div>

            {/* Error/Success Messages */}
            {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    {error}
                </div>
            )}
            {success && (
                <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
                    {success}
                </div>
            )}

            {/* Add New Domain Form */}
            {isAdding && (
                <div className="mb-6 p-4 rounded-lg border border-[var(--border)] bg-[var(--background)]">
                    <div className="mb-4">
                        <label className="block text-sm font-medium mb-2">Domain</label>
                        <input
                            type="text"
                            value={newDomain}
                            onChange={(e) => setNewDomain(e.target.value)}
                            placeholder="app.example.com"
                            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                        />
                        <p className="text-xs text-[var(--muted-foreground)] mt-1">
                            Enter your domain or subdomain (e.g., app.example.com)
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleAdd}
                            className="btn btn-primary"
                            disabled={isSubmitting || !newDomain.trim()}
                        >
                            {isSubmitting ? 'Adding...' : 'Add Domain'}
                        </button>
                        <button
                            onClick={() => {
                                setIsAdding(false);
                                setNewDomain('');
                                setError(null);
                            }}
                            className="btn"
                            disabled={isSubmitting}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Verification Steps UI */}
            {dnsRecords.length > 0 && (
                <div className="mb-6 p-6 rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-semibold text-lg flex items-center gap-2">
                            <ShieldCheck className="w-5 h-5 text-[var(--primary)]" />
                            Verification Steps
                        </h3>
                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20">
                            <span className="flex h-2 w-2 rounded-full bg-yellow-400 animate-pulse"></span>
                            <span className="text-xs font-medium text-yellow-400">Analyzing...</span>
                        </div>
                    </div>

                    <div className="mb-8 flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-2 text-[var(--foreground)] font-medium">
                            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-bold">1</div>
                            <span>DNS Configuration</span>
                        </div>
                        <div className="h-[1px] flex-1 bg-[var(--border)]"></div>
                        <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-[var(--muted)] text-[var(--muted-foreground)] text-xs font-bold">2</div>
                            <span>Securing your site</span>
                        </div>
                        <div className="h-[1px] flex-1 bg-[var(--border)]"></div>
                        <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-[var(--muted)] text-[var(--muted-foreground)] text-xs font-bold">3</div>
                            <span>Ready</span>
                        </div>
                    </div>

                    <p className="text-sm text-[var(--muted-foreground)] mb-4">
                        Please add the following DNS records to your domain provider to verify ownership.
                    </p>

                    <div className="overflow-hidden rounded-md border border-[var(--border)] mb-4">
                        <table className="w-full text-sm">
                            <thead className="bg-[var(--muted)]/50">
                                <tr className="text-left text-[var(--muted-foreground)]">
                                    <th className="py-3 px-4 font-medium">Type</th>
                                    <th className="py-3 px-4 font-medium">Host</th>
                                    <th className="py-3 px-4 font-medium">Value</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]">
                                {dnsRecords.map((record, index) => (
                                    <tr key={index} className="bg-[var(--background)]">
                                        <td className="py-3 px-4 font-mono font-medium">{record.type}</td>
                                        <td className="py-3 px-4 font-mono text-[var(--muted-foreground)]">{record.name}</td>
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-3">
                                                <code className="font-mono text-xs bg-[var(--muted)]/50 px-2 py-1 rounded border border-[var(--border)] max-w-[200px] truncate" title={record.value}>
                                                    {record.value}
                                                </code>
                                                <button
                                                    onClick={() => copyToClipboard(record.value)}
                                                    className="p-1.5 hover:bg-[var(--muted)] rounded-md transition-colors text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                                                    title="Copy value"
                                                >
                                                    {copiedValue === record.value ? (
                                                        <Check className="w-3.5 h-3.5 text-green-500" />
                                                    ) : (
                                                        <Copy className="w-3.5 h-3.5" />
                                                    )}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex justify-end">
                        <button
                            onClick={() => setDnsRecords([])}
                            className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            )}

            {/* Cloudflare Setup Guide (Recommended) */}
            {productionUrl && (
                <div className="mb-6 p-4 rounded-lg border border-orange-500/30 bg-orange-500/5">
                    <div className="flex items-center gap-2 mb-3">
                        <svg className="w-5 h-5 text-orange-400" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M16.5088 16.8447C16.6173 16.4322 16.5258 16.0192 16.2589 15.7124C16.0023 15.4178 15.6013 15.2598 15.1548 15.2598H8.14015C8.0463 15.2598 7.9648 15.2158 7.9193 15.1421C7.8738 15.0681 7.8705 14.9768 7.9098 14.8968L8.2618 14.1958C8.3471 14.0268 8.5218 13.9185 8.7113 13.9185H15.2883C16.1918 13.9185 17.0173 13.4905 17.5173 12.7598C18.0171 12.0291 18.1171 11.11 17.7903 10.2888L17.0843 8.5155C16.6423 7.3995 15.5803 6.6495 14.3803 6.6495H5.2883C5.0988 6.6495 4.9243 6.7578 4.8388 6.927L2.6673 11.2885C2.0503 12.5195 2.0503 13.9955 2.6673 15.2265L4.0553 18H15.4653C16.2173 18 16.3753 17.3175 16.5088 16.8447Z" />
                            <path d="M19.5813 11.2885L18.1098 8.2155C18.0213 8.0348 17.8488 7.9185 17.6573 7.9185H16.0873L17.0363 10.2168C17.4093 11.1755 17.2963 12.2588 16.7243 13.1145C16.1523 13.9702 15.2048 14.4772 14.1683 14.4772H8.0633L7.6873 15.2598H14.0343C14.0343 15.2598 14.9378 15.2598 15.5093 16.0658C15.9813 16.7355 15.7713 17.4 15.5093 18H20.5343C21.0693 18 21.5348 17.6415 21.6698 17.1255L21.9998 15.7505C22.3498 14.3755 21.8998 12.9285 20.7348 12.0885L19.5813 11.2885Z" />
                        </svg>
                        <h3 className="font-medium text-orange-400">Cloudflare Setup (Recommended)</h3>
                    </div>
                    <p className="text-sm text-[var(--muted-foreground)] mb-3">
                        For global CDN and faster performance, use Cloudflare instead of GCP domain mapping:
                    </p>
                    <ol className="text-sm space-y-2 text-[var(--muted-foreground)] list-decimal list-inside mb-4">
                        <li>Add your domain to <a href="https://cloudflare.com" target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:underline">Cloudflare</a> (free)</li>
                        <li>Update nameservers at your registrar to Cloudflare&apos;s</li>
                        <li>
                            Add a CNAME record in Cloudflare:
                            <div className="mt-2 ml-4 overflow-x-auto">
                                <table className="text-xs">
                                    <tbody>
                                        <tr className="border-b border-[var(--border)]">
                                            <td className="py-1 pr-3 font-medium">Type</td>
                                            <td className="py-1 pr-3">CNAME</td>
                                        </tr>
                                        <tr className="border-b border-[var(--border)]">
                                            <td className="py-1 pr-3 font-medium">Name</td>
                                            <td className="py-1 pr-3">@ or subdomain (e.g., app)</td>
                                        </tr>
                                        <tr>
                                            <td className="py-1 pr-3 font-medium">Target</td>
                                            <td className="py-1">
                                                <div className="flex items-center gap-2">
                                                    <code className="font-mono text-xs bg-[var(--card)] px-2 py-1 rounded">
                                                        {productionUrl.replace('https://', '')}
                                                    </code>
                                                    <button
                                                        onClick={() => copyToClipboard(productionUrl.replace('https://', ''))}
                                                        className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                                                        title="Copy URL"
                                                    >
                                                        {copiedValue === productionUrl.replace('https://', '') ? (
                                                            <Check className="w-4 h-4 text-green-400" />
                                                        ) : (
                                                            <Copy className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </li>
                        <li>Set SSL/TLS mode to <strong>&quot;Full (strict)&quot;</strong> in Cloudflare</li>
                        <li>Enable <strong>Proxy status</strong> (orange cloud ☁️) for caching</li>
                    </ol>
                    <p className="text-xs text-green-400">
                        ✓ No need to add domain here when using Cloudflare
                    </p>
                </div>
            )}

            {/* Divider */}
            {productionUrl && (
                <div className="relative mb-6">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-[var(--border)]"></div>
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-[var(--card)] px-2 text-[var(--muted-foreground)]">Or use GCP Domain Mapping</span>
                    </div>
                </div>
            )}

            {/* Current Production URL */}
            {productionUrl && (
                <div className="mb-4 p-3 rounded-lg border border-[var(--border)] bg-[var(--background)]">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Globe className="w-4 h-4 text-[var(--muted-foreground)]" />
                            <span className="text-sm font-medium">Cloud Run URL</span>
                        </div>
                        <a
                            href={productionUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-[var(--primary)] hover:underline flex items-center gap-1"
                        >
                            {productionUrl.replace('https://', '')}
                            <ExternalLink className="w-3 h-3" />
                        </a>
                    </div>
                </div>
            )}

            {/* Domains List */}
            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-[var(--muted-foreground)]" />
                </div>
            ) : domains.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-[var(--border)] rounded-xl bg-[var(--muted)]/5">
                    <div className="w-16 h-16 rounded-full bg-[var(--background)] border border-[var(--border)] flex items-center justify-center mb-4 shadow-sm">
                        <Globe className="w-8 h-8 text-[var(--muted-foreground)] opacity-50" />
                    </div>
                    <h3 className="text-lg font-medium mb-1">No domains configured</h3>
                    <p className="text-sm text-[var(--muted-foreground)] text-center max-w-sm mb-6">
                        Connect a custom domain to give your project a professional look.
                        We handle the SSL certificates automatically.
                    </p>
                    <button
                        onClick={() => setIsAdding(true)}
                        className="btn btn-secondary text-sm"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Your First Domain
                    </button>
                </div>
            ) : (
                <div className="space-y-2">
                    {domains.map((domain) => (
                        <div
                            key={domain.id}
                            className="flex items-center justify-between p-3 rounded-lg border border-[var(--border)] bg-[var(--background)]"
                        >
                            <div className="flex items-center gap-3">
                                {getStatusIcon(domain.status)}
                                <div>
                                    <a
                                        href={`https://${domain.domain}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-medium hover:text-[var(--primary)] flex items-center gap-1"
                                    >
                                        {domain.domain}
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                    <span className={`text-xs ${domain.status === 'active' ? 'text-green-400' :
                                        domain.status === 'pending' ? 'text-yellow-400' :
                                            'text-red-400'
                                        }`}>
                                        {getStatusLabel(domain.status)}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {domain.status === 'pending' && (
                                    <button
                                        onClick={() => fetchProjectDomains(projectId)}
                                        className="text-xs text-[var(--primary)] hover:underline"
                                    >
                                        Refresh
                                    </button>
                                )}
                                <button
                                    onClick={() => handleDelete(domain.id, domain.domain)}
                                    className="text-[var(--muted-foreground)] hover:text-red-400 p-1"
                                    title="Delete domain"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Info */}
            <div className="mt-6 text-xs text-[var(--muted-foreground)]">
                <p><strong>Note:</strong> DNS changes may take up to 48 hours to propagate worldwide.</p>
                <p className="mt-1">SSL certificates are automatically provisioned by Google Cloud.</p>
            </div>
        </div>
    );
}
