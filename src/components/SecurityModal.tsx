'use client';

import { Activity, ShieldAlert, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { useStore } from '@/store';
import type { StorageConfig, SecurityReport } from '@/types';

interface SecurityModalProps {
    isOpen: boolean;
    onClose: () => void;
    storage: StorageConfig | null;
    projectId: string;
}

export function SecurityModal({ isOpen, onClose, storage, projectId }: SecurityModalProps) {
    const { remediateSecurityThreat } = useStore();

    if (!storage) return null;

    const report = storage.metadata?.securityReport as SecurityReport | undefined;

    return (
        <ConfirmationModal
            isOpen={isOpen}
            onClose={onClose}
            title="Security Intelligence & Threat Detection"
            headerLabel="Autonomous Protection"
            icon={<ShieldAlert className="w-5 h-5 text-[var(--error)]" />}
            description={
                <div className="space-y-6">
                    <div className="p-4 bg-[var(--error)]/5 border border-[var(--error)]/20 rounded-xl space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Activity className="w-4 h-4 text-[var(--error)]" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--error)]">Active Threats Detected</span>
                            </div>
                            <div className="p-1 px-2 rounded-full bg-[var(--error)]/10 border border-[var(--error)]/20">
                                <span className="text-[10px] font-bold uppercase text-[var(--error)]">Risk Score: {report?.riskScore || 100}</span>
                            </div>
                        </div>
                        <p className="text-[10px] font-bold">
                            Deployify autonomously scans database engine logs for patterns indicating SQL injection, brute-force attacks, or unauthorized access attempts.
                        </p>
                    </div>

                    <div className="space-y-3">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] ml-1">Threat History & Active Risks</Label>
                        <div className="max-h-80 overflow-y-auto space-y-2 custom-scrollbar">
                            {!report?.activeThreats?.length ? (
                                <div className="py-12 text-center border border-dashed border-[var(--border)] rounded-2xl bg-[var(--muted)]/5">
                                    <ShieldCheck className="w-8 h-8 text-[var(--success)]/30 mx-auto mb-3" />
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">No threats detected in recent logs</p>
                                </div>
                            ) : (
                                report.activeThreats.map((t) => (
                                    <div key={t.id} className={cn(
                                        "p-3 border rounded-xl bg-[var(--background)] space-y-3 group hover:border-[var(--primary)]/30 transition-all",
                                        t.status !== 'ACTIVE' && "opacity-60"
                                    )}>
                                        <div className="flex items-center justify-between">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className={cn(
                                                        "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                                                        t.severity === 'CRITICAL' ? "bg-[var(--error)] text-[var(--error-foreground)]" :
                                                        t.severity === 'HIGH' ? "bg-[var(--error)]/10 text-[var(--error)]" :
                                                        "bg-[var(--warning)]/10 text-[var(--warning)]"
                                                    )}>
                                                        {t.severity}
                                                    </span>
                                                    <span className="text-[10px] font-bold uppercase text-[var(--primary)]">{t.type.replace(/_/g, ' ')}</span>
                                                    {t.status !== 'ACTIVE' && (
                                                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--muted)]/30 text-[var(--muted-foreground)] border border-[var(--border)]">
                                                            {t.status}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]">
                                                    SOURCE IP: <span className="text-[var(--foreground)] font-mono">{t.sourceIp}</span>
                                                </p>
                                            </div>
                                            {t.status === 'ACTIVE' && (
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => remediateSecurityThreat(projectId, storage.id, t.id, 'BLOCK_IP')}
                                                        className="h-7 text-[10px] font-bold uppercase tracking-wider border-[var(--error)]/30 text-[var(--error)] hover:bg-[var(--error)]/10"
                                                    >
                                                        Block IP
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => remediateSecurityThreat(projectId, storage.id, t.id, 'DISMISS')}
                                                        className="h-7 text-[10px] font-bold uppercase tracking-wider"
                                                    >
                                                        Dismiss
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-2 bg-[var(--muted)]/20 rounded font-mono text-[10px] font-bold whitespace-pre-wrap break-all border border-[var(--border)]/50">
                                            {t.evidence}
                                        </div>
                                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]/60">
                                            <span>DETECTED: {new Date(t.detectedAt).toLocaleString()}</span>
                                            <span>TARGET: {t.targetDatabase}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="p-3 bg-[var(--primary)]/5 border border-[var(--primary)]/20 rounded-xl flex items-start gap-2">
                        <ShieldCheck className="w-3.5 h-3.5 text-[var(--primary)] shrink-0 mt-0.5" />
                        <p className="text-[10px] font-bold uppercase text-[var(--muted-foreground)] leading-relaxed">
                            Remediation: Blocking an IP will automatically update your project&apos;s Cloud Armor security policy to deny all traffic from that source at the edge.
                        </p>
                    </div>
                </div>
            }
            showConfirm={false}
            showCancel={false}
        />
    );
}
