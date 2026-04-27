'use client';

import React, { useEffect, useState } from 'react';
import { Shield, ShieldAlert, Globe, Zap, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { toast } from 'sonner';

type SecurityLevel = 'off' | 'detection' | 'prevention';

export const ShieldSecurity = ({ projectId }: { projectId: string }) => {
    const [metrics, setMetrics] = useState<{ blockedRequests: number; topThreats: string[]; status: string } | null>(null);
    const [securityLevel, setSecurityLevel] = useState<SecurityLevel>('prevention');
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

    const handleLevelChange = async (level: SecurityLevel) => {
        setSecurityLevel(level);
        toast.promise(
            fetch(`/api/projects/${projectId}/security`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ securityLevel: level, enabled: level !== 'off' })
            }),
            {
                loading: `Updating security level to ${level}...`,
                success: `Security level updated to ${level}`,
                error: `Failed to update security level`
            }
        );
    };

    return (
        <Card className="overflow-hidden border-[var(--primary)]/10 bg-gradient-to-br from-[var(--card)] to-[var(--muted)]/5 rounded-3xl">
            <div className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                        <Shield className="w-5 h-5 text-[var(--primary)]" />
                    </div>
                    <div>
                        <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Deployify Edge</span>
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em]">Shield Security</h3>
                    </div>
                </div>
                <Badge variant={securityLevel !== 'off' ? "success" : "outline"} className="text-[8px] font-bold uppercase tracking-[0.2em]">
                    {securityLevel === 'off' ? 'Vulnerable' : securityLevel === 'detection' ? 'Monitoring' : 'Protected'}
                </Badge>
            </div>

            <div className="p-6 pt-0 space-y-6">
                <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                        <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Protection Level</div>
                        <div className="flex items-center gap-1">
                             {securityLevel === 'off' && <AlertTriangle className="w-3 h-3 text-[var(--warning)]" />}
                             {securityLevel === 'detection' && <Zap className="w-3 h-3 text-[var(--info)]" />}
                             {securityLevel === 'prevention' && <ShieldCheck className="w-3 h-3 text-[var(--success)]" />}
                             <span className="text-[8px] font-bold uppercase tracking-[0.2em]">{securityLevel}</span>
                        </div>
                    </div>
                    <SegmentedControl
                        className="w-full"
                        options={[
                            { value: 'off', label: 'Off' },
                            { value: 'detection', label: 'Detect' },
                            { value: 'prevention', label: 'Prevent' }
                        ]}
                        value={securityLevel}
                        onChange={(val) => handleLevelChange(val as SecurityLevel)}
                    />
                    <p className="text-[8px] text-[var(--muted-foreground)] px-1 uppercase tracking-[0.2em]">
                        {securityLevel === 'off' && "WAF IS DISABLED. TRAFFIC IS NOT FILTERED."}
                        {securityLevel === 'detection' && "LOGGING THREATS WITHOUT BLOCKING REQUESTS."}
                        {securityLevel === 'prevention' && "ACTIVELY BLOCKING SQL INJECTION AND XSS ATTACKS."}
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)]">
                        <div className="flex items-center space-x-2 mb-2">
                            <ShieldAlert className="w-3 h-3 text-[var(--error)]" />
                            <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Mitigated</span>
                        </div>
                        <div className="text-[10px] font-bold font-mono">{metrics?.blockedRequests || 0}</div>
                        <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)]/50">Last 24h</div>
                    </div>
                    <div className="p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)]">
                        <div className="flex items-center space-x-2 mb-2">
                            <Globe className="w-3 h-3 text-[var(--info)]" />
                            <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Edge</span>
                        </div>
                        <div className="text-[10px] font-bold font-mono">CDN</div>
                        <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--success)]">Optimized</div>
                    </div>
                </div>

                {metrics?.topThreats && metrics.topThreats.length > 0 && (
                    <div className="space-y-2">
                        <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)] px-1">Active Mitigation Threats</div>
                        <div className="flex flex-wrap gap-2">
                            {metrics.topThreats.map((threat, i) => (
                                <Badge key={i} variant="outline" className="text-[8px] font-bold uppercase tracking-[0.2em] bg-[var(--error)]/5 text-[var(--error)]/80 border-[var(--error)]/20">
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
