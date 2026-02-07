'use client';

import { useState } from 'react';
import { Loader2, MapPin, Check, RefreshCcw } from 'lucide-react';
import { useStore } from '@/store';

// Common GCP regions for Cloud Run
// See: https://cloud.google.com/run/docs/locations
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
        <div className="card mt-8">
            <div className="flex items-center gap-2 mb-4">
                <MapPin className="w-5 h-5 text-[var(--primary)]" />
                <h2 className="text-lg font-semibold">Deployment Region</h2>
            </div>

            <p className="text-sm text-[var(--muted-foreground)] mb-4">
                Select the Google Cloud region where your application will be deployed.
                Choose a region close to your users for better performance.
            </p>

            {error && (
                <div className="mb-4 p-3 rounded-lg bg-[var(--error-bg)] border border-[var(--error)] text-[var(--error)] text-sm">
                    {error}
                </div>
            )}

            <div className="flex items-center gap-4">
                <div className="flex-1">
                    <select
                        value={selectedRegion}
                        onChange={(e) => handleRegionChange(e.target.value)}
                        disabled={saving}
                        className="input w-full"
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
                </div>

                <div className="flex items-center gap-2 min-w-[80px]">
                    {saving && (
                        <span className="flex items-center gap-1 text-sm text-[var(--muted-foreground)]">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Saving...
                        </span>
                    )}
                    {saved && (
                        <span className="flex items-center gap-1 text-sm text-[var(--success)]">
                            <Check className="w-4 h-4" />
                            Saved
                        </span>
                    )}
                </div>
            </div>

            <div className="mt-4 p-3 rounded-lg bg-[var(--background)] border border-[var(--border)]">
                <div className="flex items-start gap-2">
                    <RefreshCcw className="w-4 h-4 text-[var(--info)] mt-0.5" />
                    <div className="text-sm text-[var(--muted-foreground)]">
                        <p className="font-medium text-[var(--foreground)]">Note:</p>
                        <p>
                            Changing the region will affect the next deployment.
                            To apply the change immediately, trigger a redeploy after saving.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
