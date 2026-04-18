'use client';

import { useState } from 'react';
import { Loader2, MapPin, Check, RefreshCcw } from 'lucide-react';
import { useStore } from '@/store';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';

// Common GCP regions for Cloud Run
const GCP_REGIONS = [
    { value: 'us-central1', label: 'IOWA (US-CENTRAL1)', tier: 'TIER 1' },
    { value: 'us-east1', label: 'SOUTH CAROLINA (US-EAST1)', tier: 'TIER 1' },
    { value: 'us-east4', label: 'NORTHERN VIRGINIA (US-EAST4)', tier: 'TIER 1' },
    { value: 'us-west1', label: 'OREGON (US-WEST1)', tier: 'TIER 1' },
    { value: 'europe-west1', label: 'BELGIUM (EUROPE-WEST1)', tier: 'TIER 1' },
    { value: 'europe-west2', label: 'LONDON (EUROPE-WEST2)', tier: 'TIER 1' },
    { value: 'europe-west4', label: 'NETHERLANDS (EUROPE-WEST4)', tier: 'TIER 1' },
    { value: 'asia-east1', label: 'TAIWAN (ASIA-EAST1)', tier: 'TIER 1' },
    { value: 'asia-northeast1', label: 'TOKYO (ASIA-NORTHEAST1)', tier: 'TIER 1' },
    { value: 'asia-southeast1', label: 'SINGAPORE (ASIA-SOUTHEAST1)', tier: 'TIER 1' },
    { value: 'asia-south1', label: 'MUMBAI (ASIA-SOUTH1)', tier: 'TIER 2' },
    { value: 'australia-southeast1', label: 'SYDNEY (AUSTRALIA-SOUTHEAST1)', tier: 'TIER 2' },
    { value: 'southamerica-east1', label: 'SÃO PAULO (SOUTHAMERICA-EAST1)', tier: 'TIER 2' },
    { value: 'me-west1', label: 'TEL AVIV (ME-WEST1)', tier: 'TIER 2' },
    { value: 'africa-south1', label: 'JOHANNESBURG (AFRICA-SOUTH1)', tier: 'TIER 2' },
];

interface RegionSettingsProps {
    projectId: string;
    onUpdate?: () => void;
}

export function RegionSettings({ projectId, onUpdate }: RegionSettingsProps) {
    const { currentProject, updateProjectRegion } = useStore();
    const currentRegion = currentProject?.region;

    const [selectedRegion, setSelectedRegion] = useState(currentRegion || '');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleRegionChange = async (newRegion: string) => {
        setSelectedRegion(newRegion);
        setSaving(true);
        setError(null);
        setSaved(false);

        try {
            const success = await updateProjectRegion(projectId, newRegion || null);

            if (success) {
                setSaved(true);
                if (onUpdate) onUpdate();
                // Hide the saved indicator after 2 seconds
                setTimeout(() => setSaved(false), 2000);
            } else {
                throw new Error('Failed to update region');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update region');
        } finally {
            setSaving(false);
        }
    };

    // Group regions by tier
    const tier1Regions = GCP_REGIONS.filter(r => r.tier === 'TIER 1');
    const tier2Regions = GCP_REGIONS.filter(r => r.tier === 'TIER 2');

    return (
        <Card className="overflow-hidden p-0">
            <div className="p-6 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                    <MapPin className="w-5 h-5 text-[var(--primary)]" />
                </div>
                <div>
                    <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Infrastructure</span>
                    <h3 className="text-[10px] font-bold">Deployment Region</h3>
                </div>
            </div>

            <Separator className="bg-[var(--border)]" />

            <div className="p-6 space-y-4">
                {error && (
                    <div className="mb-4 p-3 rounded-lg bg-[var(--error-bg)] border border-[var(--error)] text-[var(--error)] text-[10px]">
                        {error}
                    </div>
                )}
                <div className="grid gap-2">
                    <Label htmlFor="region-select" className="text-[10px] font-bold">Region</Label>
                    <NativeSelect
                        id="region-select"
                        value={selectedRegion}
                        onChange={(e) => handleRegionChange(e.target.value)}
                        disabled={saving}
                    >
                        <option value="">USE DEFAULT REGION</option>

                        <optgroup label="TIER 1 REGIONS (LOWER LATENCY)">
                            {tier1Regions.map((region) => (
                                <option key={region.value} value={region.value}>
                                    {region.label}
                                </option>
                            ))}
                        </optgroup>

                        <optgroup label="TIER 2 REGIONS">
                            {tier2Regions.map((region) => (
                                <option key={region.value} value={region.value}>
                                    {region.label}
                                </option>
                            ))}
                        </optgroup>
                    </NativeSelect>
                </div>

                <div className="flex items-center gap-2 h-6">
                    {saving && (
                        <span className="flex items-center gap-2 text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] animate-fade-in">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Saving...
                        </span>
                    )}
                    {saved && (
                        <span className="flex items-center gap-2 text-[8px] font-bold uppercase tracking-wider text-[var(--success)] animate-fade-in">
                            <Check className="w-3.5 h-3.5" />
                            Saved successfully
                        </span>
                    )}
                </div>

                <div className="mt-8 p-4 rounded-lg bg-[var(--info-bg)] border border-[var(--info)]/20">
                <div className="flex items-start gap-3">
                    <RefreshCcw className="w-4 h-4 text-[var(--info)] mt-0.5" />
                    <div className="text-[10px]">
                        <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--info)] mb-1">Deployment Required</p>
                        <p className="text-[var(--muted-foreground)] leading-relaxed">
                            Changing the region will affect the next deployment.
                            To apply the change immediately, trigger a redeploy after saving.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    </Card>
    );
}
