'use client';

import React, { useEffect, useState } from 'react';
import { Shield, ShieldAlert, Globe } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

export const ShieldSecurity = ({ projectId }: { projectId: string }) => {
    const [metrics, setMetrics] = useState<{ blockedRequests: number; topThreats: string[]; status: string } | null>(null);
    const [wafEnabled, setWafEnabled] = useState(true);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchMetrics = async () => {
            try {
                const res = await fetch(`/api/projects/${projectId}/security`);
                const data = await res.json();
                if (data.success) {
                    setMetrics(data.metrics);
                }
            } catch (error) {
                console.error('Failed to fetch security metrics:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchMetrics();
    }, [projectId]);

    if (loading) {
        return (
            <Card className="overflow-hidden border-[var(--primary)]/10 bg-gradient-to-br from-[var(--card)] to-[var(--muted)]/5 h-[300px] flex items-center justify-center">
                <div className="w-5 h-5 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
            </Card>
        );
    }

    const handleToggleWaf = async (enabled: boolean) => {
        setWafEnabled(enabled);
        toast.promise(
            fetch(`/api/projects/${projectId}/security`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled })
            }),
            {
                loading: `${enabled ? 'Enabling' : 'Disabling'} Global WAF...`,
                success: `Global WAF ${enabled ? 'enabled' : 'disabled'} successfully`,
                error: `Failed to ${enabled ? 'enable' : 'disable'} Global WAF`
            }
        );
    };

    return (
        <Card className="overflow-hidden border-[var(--primary)]/10 bg-gradient-to-br from-[var(--card)] to-[var(--muted)]/5 rounded-3xl backdrop-blur-xl">
            <div className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                        <Shield className="w-5 h-5 text-[var(--primary)]" />
                    </div>
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Deployify Edge</span>
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em]">Shield Security</h3>
                    </div>
                </div>
                <Badge variant={wafEnabled ? "success" : "outline"} className="text-[10px] font-bold uppercase tracking-[0.2em]">
                    {wafEnabled ? 'Protected' : 'Off'}
                </Badge>
            </div>

            <div className="p-6 pt-0 space-y-6">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)]">
                    <div className="space-y-1">
                        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Global WAF</div>
                        <div className="text-[10px] font-bold">SQLi & XSS Protection</div>
                    </div>
                    <Switch
                        checked={wafEnabled}
                        onCheckedChange={handleToggleWaf}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)]">
                        <div className="flex items-center space-x-2 mb-2">
                            <ShieldAlert className="w-3 h-3 text-[var(--error)]" />
                            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Blocked</span>
                        </div>
                        <div className="text-[10px] font-bold font-mono">{metrics?.blockedRequests || 0}</div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)]/50">Last 24h</div>
                    </div>
                    <div className="p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)]">
                        <div className="flex items-center space-x-2 mb-2">
                            <Globe className="w-3 h-3 text-[var(--info)]" />
                            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Edge</span>
                        </div>
                        <div className="text-[10px] font-bold font-mono">CDN</div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--success)]">Optimized</div>
                    </div>
                </div>

                {metrics?.topThreats && metrics.topThreats.length > 0 && (
                    <div className="space-y-2">
                        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)] px-1">Top Mitigated Threats</div>
                        <div className="flex flex-wrap gap-2">
                            {metrics.topThreats.map((threat, i) => (
                                <Badge key={i} variant="outline" className="text-[10px] font-bold uppercase tracking-wider bg-[var(--error)]/5 text-[var(--error)]/80 border-[var(--error)]/20">
                                    {threat}
                                </Badge>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </Card>
    );
};
