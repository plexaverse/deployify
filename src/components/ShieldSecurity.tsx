'use client';

import React, { useEffect, useState } from 'react';
import { Shield, ShieldAlert, Globe } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

export const ShieldSecurity = ({ projectId }: { projectId: string }) => {
    const [metrics, setMetrics] = useState<{ blockedRequests: number; topThreats: string[]; status: string } | null>(null);
    const [wafEnabled, setWafEnabled] = useState(true);

    useEffect(() => {
        // Simulate fetching security metrics
        const fetchMetrics = () => {
            setMetrics({
                blockedRequests: 42,
                topThreats: ['SQL Injection', 'Cross-Site Scripting'],
                status: 'active'
            });
        };
        fetchMetrics();
    }, [projectId]);

    return (
        <Card className="overflow-hidden border-[var(--primary)]/10 bg-gradient-to-br from-[var(--card)] to-[var(--muted)]/5">
            <div className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                        <Shield className="w-5 h-5 text-[var(--primary)]" />
                    </div>
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Deployify Edge</span>
                        <h3 className="text-xs font-bold">Shield Security</h3>
                    </div>
                </div>
                <Badge variant={wafEnabled ? "success" : "outline"} className="text-[10px] font-bold uppercase tracking-wider">
                    {wafEnabled ? 'Protected' : 'Off'}
                </Badge>
            </div>

            <div className="p-6 pt-0 space-y-6">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10">
                    <div className="space-y-1">
                        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Global WAF</div>
                        <div className="text-xs font-bold">SQLi & XSS Protection</div>
                    </div>
                    <Switch
                        checked={wafEnabled}
                        onCheckedChange={setWafEnabled}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                        <div className="flex items-center space-x-2 mb-2">
                            <ShieldAlert className="w-3 h-3 text-red-400" />
                            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">Blocked</span>
                        </div>
                        <div className="text-xl font-bold font-mono">{metrics?.blockedRequests || 0}</div>
                        <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/20">Last 24h</div>
                    </div>
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                        <div className="flex items-center space-x-2 mb-2">
                            <Globe className="w-3 h-3 text-blue-400" />
                            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">Edge</span>
                        </div>
                        <div className="text-xl font-bold font-mono">CDN</div>
                        <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-green-400">Optimized</div>
                    </div>
                </div>

                {metrics?.topThreats && metrics.topThreats.length > 0 && (
                    <div className="space-y-2">
                        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 px-1">Top Mitigated Threats</div>
                        <div className="flex flex-wrap gap-2">
                            {metrics.topThreats.map((threat, i) => (
                                <Badge key={i} variant="outline" className="text-[9px] font-bold uppercase tracking-wider bg-red-400/5 text-red-400/80 border-red-400/20">
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
