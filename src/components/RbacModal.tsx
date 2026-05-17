'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { ShieldCheck, Plus, Trash2, Lock, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import type { StorageConfig, StorageRbacSettings, StorageRbacRule, TeamRole } from '@/types';

interface RbacModalProps {
    isOpen: boolean;
    onClose: () => void;
    storage: StorageConfig | null;
    projectId: string;
}

const ROLES: TeamRole[] = ['owner', 'admin', 'member', 'viewer'];

export function RbacModal({ isOpen, onClose, storage, projectId }: RbacModalProps) {
    const [settings, setRbacSettings] = useState<StorageRbacSettings>({
        enabled: false,
        rules: [],
        lastUpdated: new Date().toISOString()
    });
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const fetchRbacSettings = useCallback(async () => {
        if (!storage) return;
        setIsLoading(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/storage/${storage.id}/rbac`);
            const data = await res.json();
            if (data.success) {
                setRbacSettings(data.rbacSettings);
            }
        } catch (error) {
            console.error('Failed to fetch RBAC settings:', error);
            toast.error('Failed to load RBAC settings');
        } finally {
            setIsLoading(false);
        }
    }, [storage, projectId]);

    useEffect(() => {
        if (isOpen && storage) {
            fetchRbacSettings();
        }
    }, [isOpen, storage, fetchRbacSettings]);

    const handleSave = async () => {
        if (!storage) return;
        setIsSaving(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/storage/${storage.id}/rbac`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rbacSettings: settings }),
            });
            const data = await res.json();
            if (data.success) {
                toast.success('RBAC policies updated');
                onClose();
            } else {
                toast.error(data.error || 'Failed to update RBAC');
            }
        } catch (error) {
            console.error('Failed to save RBAC:', error);
            toast.error('An error occurred while saving RBAC');
        } finally {
            setIsSaving(false);
        }
    };

    const addRule = () => {
        const newRule: StorageRbacRule = {
            id: `rule_${Math.random().toString(36).substring(2, 9)}`,
            type: 'COLUMN_MASK',
            entity: '*',
            roles: ['viewer'],
            maskingType: 'FULL',
            enabled: true
        };
        setRbacSettings(prev => ({
            ...prev,
            rules: [...prev.rules, newRule]
        }));
    };

    const updateRule = (id: string, updates: Partial<StorageRbacRule>) => {
        setRbacSettings(prev => ({
            ...prev,
            rules: prev.rules.map(r => r.id === id ? { ...r, ...updates } : r)
        }));
    };

    const deleteRule = (id: string) => {
        setRbacSettings(prev => ({
            ...prev,
            rules: prev.rules.filter(r => r.id !== id)
        }));
    };

    const toggleRole = (ruleId: string, role: TeamRole) => {
        const rule = settings.rules.find(r => r.id === ruleId);
        if (!rule) return;

        const newRoles = rule.roles.includes(role)
            ? rule.roles.filter(r => r !== role)
            : [...rule.roles, role];

        updateRule(ruleId, { roles: newRoles });
    };

    if (!storage) return null;

    return (
        <ConfirmationModal
            isOpen={isOpen}
            onClose={onClose}
            onConfirm={handleSave}
            title="Database RBAC & Data Masking"
            headerLabel="Security Governance"
            icon={<Lock className="w-5 h-5 text-[var(--primary)]" />}
            description={
                <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 border border-[var(--border)] rounded-xl bg-[var(--muted)]/5">
                        <div className="space-y-0.5">
                            <Label htmlFor="rbac-toggle" className="text-[10px] font-bold cursor-pointer">Enable RBAC Enforcement</Label>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Apply masking and filtering rules to Data Lab queries</p>
                        </div>
                        <input
                            id="rbac-toggle"
                            type="checkbox"
                            checked={settings.enabled}
                            onChange={(e) => setRbacSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                            className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)] cursor-pointer"
                        />
                    </div>

                    <div className={cn("space-y-4", !settings.enabled && "opacity-40 pointer-events-none")}>
                        <div className="flex items-center justify-between ml-1">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Access Control Rules</Label>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={addRule}
                                className="h-6 px-2 text-[10px] font-bold uppercase text-[var(--primary)]"
                            >
                                <Plus className="w-3.5 h-3.5 mr-1" />
                                Add Rule
                            </Button>
                        </div>

                        {isLoading ? (
                            <div className="py-20 flex flex-col items-center justify-center gap-2">
                                <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Loading policies...</span>
                            </div>
                        ) : settings.rules.length === 0 ? (
                            <div className="py-12 text-center border border-dashed border-[var(--border)] rounded-2xl bg-[var(--muted)]/5">
                                <ShieldCheck className="w-8 h-8 text-[var(--muted-foreground)]/30 mx-auto mb-3" />
                                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">No RBAC rules defined</p>
                            </div>
                        ) : (
                            <div className="max-h-96 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                                {settings.rules.map((rule) => (
                                    <div key={rule.id} className="p-4 border border-[var(--border)] rounded-xl bg-[var(--background)] space-y-4 group">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <NativeSelect
                                                    value={rule.type}
                                                    onChange={(e) => updateRule(rule.id, { type: e.target.value as 'COLUMN_MASK' | 'ROW_FILTER' })}
                                                    className="h-7 text-[10px] font-bold uppercase w-32"
                                                >
                                                    <option value="COLUMN_MASK">COLUMN MASK</option>
                                                    <option value="ROW_FILTER">ROW FILTER</option>
                                                </NativeSelect>
                                                <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase">On</span>
                                                <Input
                                                    value={rule.entity}
                                                    onChange={(e) => updateRule(rule.id, { entity: e.target.value })}
                                                    placeholder="TABLE/COLLECTION"
                                                    className="h-7 text-[10px] font-bold uppercase w-32"
                                                />
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => deleteRule(rule.id)}
                                                className="h-7 w-7 text-[var(--muted-foreground)] hover:text-[var(--error)]"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            {rule.type === 'COLUMN_MASK' ? (
                                                <div className="space-y-2">
                                                    <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Field to Mask</Label>
                                                    <div className="flex gap-2">
                                                        <Input
                                                            value={rule.field || ''}
                                                            onChange={(e) => updateRule(rule.id, { field: e.target.value })}
                                                            placeholder="FIELD NAME"
                                                            className="h-8 text-[10px] font-bold uppercase"
                                                        />
                                                        <NativeSelect
                                                            value={rule.maskingType}
                                                            onChange={(e) => updateRule(rule.id, { maskingType: e.target.value as 'FULL' | 'PARTIAL' | 'HASH' })}
                                                            className="h-8 text-[10px] font-bold uppercase"
                                                        >
                                                            <option value="FULL">FULL</option>
                                                            <option value="PARTIAL">PARTIAL</option>
                                                            <option value="HASH">HASH</option>
                                                        </NativeSelect>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Filter Condition</Label>
                                                    <Input
                                                        value={rule.filterCondition || ''}
                                                        onChange={(e) => updateRule(rule.id, { filterCondition: e.target.value })}
                                                        placeholder="E.G. STATUS = 'ACTIVE'"
                                                        className="h-8 text-[10px] font-bold uppercase"
                                                    />
                                                </div>
                                            )}

                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Apply to Roles</Label>
                                                <div className="flex flex-wrap gap-1">
                                                    {ROLES.map((role) => (
                                                        <button
                                                            key={role}
                                                            onClick={() => toggleRole(rule.id, role)}
                                                            className={cn(
                                                                "px-2 py-0.5 rounded text-[10px] font-bold uppercase border transition-all",
                                                                rule.roles.includes(role)
                                                                    ? "bg-[var(--primary)]/10 text-[var(--primary)] border-[var(--primary)]/30"
                                                                    : "bg-[var(--muted)]/5 text-[var(--muted-foreground)] border-[var(--border)]"
                                                            )}
                                                        >
                                                            {role}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="p-3 bg-[var(--primary)]/5 border border-[var(--primary)]/20 rounded-xl flex items-start gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-[var(--primary)] shrink-0 mt-0.5" />
                        <p className="text-[10px] font-bold uppercase text-[var(--muted-foreground)] leading-relaxed">
                            RBAC policies are applied server-side by the Data Lab proxy. Full masking replaces data with asterisks, while hashing provides a stable unique representation.
                        </p>
                    </div>
                </div>
            }
            confirmText="Save RBAC Policies"
            loading={isSaving}
        />
    );
}
