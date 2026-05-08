'use client';

import {
    ShieldAlert,
    ShieldCheck,
    Lock,
    EyeOff,
    Calendar,
    Database,
    Table,
    ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import type { StorageConfig, ComplianceReport, ComplianceRisk } from '@/types';

interface ComplianceModalProps {
    isOpen: boolean;
    onClose: () => void;
    storage: StorageConfig | null;
    projectId?: string;
}

export function ComplianceModal({ isOpen, onClose, storage }: ComplianceModalProps) {
    if (!storage) return null;

    const report = storage.metadata?.complianceReport as ComplianceReport | undefined;

    const getRiskColor = (type: ComplianceRisk['type']) => {
        switch (type) {
            case 'CREDIT_CARD':
            case 'SSN':
                return 'text-[var(--error)] bg-[var(--error)]/10 border-[var(--error)]/20';
            case 'EMAIL':
            case 'PHONE':
            case 'API_TOKEN':
                return 'text-[var(--warning)] bg-[var(--warning)]/10 border-[var(--warning)]/20';
            default:
                return 'text-[var(--muted-foreground)] bg-[var(--muted)]/10 border-[var(--border)]';
        }
    };

    return (
        <ConfirmationModal
            isOpen={isOpen}
            onClose={onClose}
            title="Data Governance & Compliance"
            headerLabel="Privacy Intelligence"
            icon={<ShieldAlert className="w-5 h-5 text-[var(--primary)]" />}
            description={
                <div className="space-y-6">
                    <div className={cn(
                        "p-4 rounded-xl border space-y-4",
                        report?.hasRisk ? "bg-[var(--error)]/5 border-[var(--error)]/20" : "bg-[var(--success)]/5 border-[var(--success)]/20"
                    )}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                {report?.hasRisk ? (
                                    <ShieldAlert className="w-4 h-4 text-[var(--error)]" />
                                ) : (
                                    <ShieldCheck className="w-4 h-4 text-[var(--success)]" />
                                )}
                                <span className={cn(
                                    "text-[10px] font-bold uppercase tracking-wider",
                                    report?.hasRisk ? "text-[var(--error)]" : "text-[var(--success)]"
                                )}>
                                    {report?.hasRisk ? 'Sensitive Data Detected' : 'No Sensitive Data Detected'}
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[var(--muted-foreground)]">
                                <Calendar className="w-3.5 h-3.5" />
                                <span className="text-[10px] font-mono font-bold uppercase">
                                    Last Scan: {report?.lastScannedAt ? new Date(report.lastScannedAt).toLocaleDateString() : 'NEVER'}
                                </span>
                            </div>
                        </div>
                        <p className="text-[10px] font-bold text-[var(--foreground)] leading-relaxed">
                            {report?.hasRisk
                                ? `Deployify identified ${report.risks.length} potentially sensitive fields during the last autonomous compliance scan. Unmasked PII (Personally Identifiable Information) can increase security and compliance overhead.`
                                : 'The last autonomous scan did not identify any unmasked PII (Personally Identifiable Information) in the sampled records. Your data governance posture is currently optimal.'
                            }
                        </p>
                    </div>

                    {report?.hasRisk && (
                        <div className="space-y-3">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] ml-1">Compliance Risk Inventory</Label>
                            <div className="max-h-80 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                {report.risks.map((risk, i) => (
                                    <div key={i} className="p-3 border border-[var(--border)] rounded-xl bg-[var(--background)] space-y-3 group hover:border-[var(--primary)]/30 transition-all">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={cn(
                                                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border",
                                                    getRiskColor(risk.type)
                                                )}>
                                                    <EyeOff className="w-4 h-4" />
                                                </div>
                                                <div className="space-y-0.5">
                                                    <div className="flex items-center gap-2">
                                                        <span className={cn(
                                                            "text-[10px] font-bold uppercase px-1.5 rounded",
                                                            getRiskColor(risk.type)
                                                        )}>{risk.type.replace('_', ' ')}</span>
                                                        <span className="text-[10px] font-bold uppercase text-[var(--foreground)]">{risk.entity}.{risk.field}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                                                        {storage.type === 'firestore' ? <Database className="w-3 h-3" /> : <Table className="w-3 h-3" />}
                                                        <span className="text-[10px] font-bold uppercase tracking-wider">
                                                            {storage.type === 'firestore' ? 'COLLECTION' : 'TABLE'}: {risk.entity}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-2.5 rounded-lg bg-[var(--muted)]/5 border border-[var(--border)] flex items-center justify-between gap-4">
                                            <div className="space-y-0.5">
                                                <span className="text-[10px] font-bold uppercase text-[var(--muted-foreground)] block">Sample Value</span>
                                                <span className="text-[10px] font-mono font-bold text-[var(--foreground)] opacity-80">{risk.sampleValue}</span>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-[var(--muted-foreground)]/30" />
                                            <div className="text-right space-y-0.5">
                                                <span className="text-[10px] font-bold uppercase text-[var(--primary)] block">Recommendation</span>
                                                <span className="text-[10px] font-bold uppercase text-[var(--primary)]">Apply Masking</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="p-4 bg-[var(--info-bg)] border border-[var(--info)]/20 rounded-xl flex items-start gap-3">
                        <Lock className="w-4 h-4 text-[var(--info)] shrink-0 mt-0.5" />
                        <div className="space-y-1">
                            <p className="text-[10px] font-bold uppercase text-[var(--info)]">Privacy Governance Tip</p>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] leading-relaxed">
                                Use the <strong className="text-[var(--foreground)]">Dynamic Data Masking</strong> utility in the Data Lab to automatically obfuscate these fields during result set rendering. This ensures developers see masked values while preserving original data in the database.
                            </p>
                        </div>
                    </div>
                </div>
            }
            showConfirm={false}
            showCancel={false}
        />
    );
}
