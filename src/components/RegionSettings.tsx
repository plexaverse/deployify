'use client';

import { useState } from 'react';
import { Loader2, MapPin, Check, RefreshCcw } from 'lucide-react';
import { useStore } from '@/store';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// Common GCP regions for Cloud Run
const GCP_REGIONS = [
    { value: 'us-central1', label: 'Iowa (us-central1)', tier: 'Tier 1' },
    { value: 'us-east1', label: 'South Carolina (us-east1)', tier: 'Tier 1' },
    { value: 'us-east4', label: 'Northern Virginia (us-east4)', tier: 'Tier 1' },
    { value: 'us-west1', label: 'Oregon (us-west1)', tier: 'Tier 1' },
    { value: 'europe-west1', label: 'Belgium (europe-west1)', tier: 'Tier 1' },
    { value: 'europe-west2', label: 'London (europe-west2)', tier: 'Tier 1' },
    { value: 'europe-west4', label: 'Netherlands (europe-west4)', tier: 'Tier 1' },
    { value: 'asia-east1', label: 'Taiwan (asia-east1)', tier: 'Tier 1' },
    { value: 'asia-northeast1', label: 'Tokyo (asia-northeast1)', tier: 'Tier 1' },
    { value: 'asia-southeast1', label: 'Singapore (asia-southeast1)', tier: 'Tier 1' },
    { value: 'asia-south1', label: 'Mumbai (asia-south1)', tier: 'Tier 2' },
    { value: 'australia-southeast1', label: 'Sydney (australia-southeast1)', tier: 'Tier 2' },
    { value: 'southamerica-east1', label: 'São Paulo (southamerica-east1)', tier: 'Tier 2' },
    { value: 'me-west1', label: 'Tel Aviv (me-west1)', tier: 'Tier 2' },
    { value: 'africa-south1', label: 'Johannesburg (africa-south1)', tier: 'Tier 2' },
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
    const tier1Regions = GCP_REGIONS.filter(r => r.tier === 'Tier 1');
    const tier2Regions = GCP_REGIONS.filter(r => r.tier === 'Tier 2');

    return (
        <Card className="mt-8">
            <div className="flex items-center gap-2 mb-4">
                <MapPin className="w-5 h-5 text-[var(--primary)]" />
                <h2 className="text-lg font-semibold">Deployment Region</h2>
            </div>

            <p className="text-sm text-[var(--muted-foreground)] mb-6">
                Select the Google Cloud region where your application will be deployed.
                Choose a region close to your users for better performance.
            </p>

            {error && (
                <div className="mb-4 p-3 rounded-lg bg-[var(--error-bg)] border border-[var(--error)] text-[var(--error)] text-sm">
                    {error}
                </div>
            )}

            <div className="space-y-4">
                <div className="grid gap-2">
                    <Label htmlFor="region-select">Region</Label>
                    <div className="relative">
                        <select
                            id="region-select"
                            value={selectedRegion}
                            onChange={(e) => handleRegionChange(e.target.value)}
                            disabled={saving}
                            className={cn(
                                "flex h-10 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm ring-offset-[var(--background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none"
                            )}
                        >
                            <option value="">Use default region</option>

                            <optgroup label="Tier 1 Regions (Lower latency)">
                                {tier1Regions.map((region) => (
                                    <option key={region.value} value={region.value}>
                                        {region.label}
                                    </option>
                                ))}
                            </optgroup>

                            <optgroup label="Tier 2 Regions">
                                {tier2Regions.map((region) => (
                                    <option key={region.value} value={region.value}>
                                        {region.label}
                                    </option>
                                ))}
                            </optgroup>
                        </select>
                        <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-[var(--muted-foreground)]">
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 h-6">
                    {saving && (
                        <span className="flex items-center gap-2 text-sm text-[var(--muted-foreground)] animate-fade-in">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Saving...
                        </span>
                    )}
                    {saved && (
                        <span className="flex items-center gap-2 text-sm text-[var(--success)] animate-fade-in">
                            <Check className="w-3.5 h-3.5" />
                            Saved successfully
                        </span>
                    )}
                </div>
            </div>

            <div className="mt-6 p-4 rounded-lg bg-[var(--background)] border border-[var(--border)]">
                <div className="flex items-start gap-3">
                    <RefreshCcw className="w-4 h-4 text-[var(--info)] mt-0.5" />
                    <div className="text-sm">
                        <p className="font-medium text-[var(--foreground)] mb-1">Deployment Required</p>
                        <p className="text-[var(--muted-foreground)] leading-relaxed">
                            Changing the region will affect the next deployment.
                            To apply the change immediately, trigger a redeploy after saving.
                        </p>
                    </div>
                </div>
            </div>
        </Card>
    );
}
