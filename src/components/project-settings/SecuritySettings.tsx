'use client';

import { useStore } from '@/store';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

interface SecuritySettingsProps {
    projectId: string;
}

export function SecuritySettings({ projectId }: SecuritySettingsProps) {
    const {
        cloudArmorEnabled,
        isSavingSecurity: saving,
        setProjectSettingsField,
        saveSecuritySettings
    } = useStore();

    return (
        <Card className="mt-8">
            <CardHeader>
                <CardTitle>Security</CardTitle>
                <CardDescription>Configure security settings for your project.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center gap-4 p-4 border rounded-md bg-secondary/20">
                    <Switch
                        id="cloud-armor"
                        checked={cloudArmorEnabled}
                        onCheckedChange={(checked) => setProjectSettingsField('cloudArmorEnabled', checked)}
                    />
                    <div className="space-y-0.5">
                        <Label htmlFor="cloud-armor">Cloud Armor WAF</Label>
                        <p className="text-xs text-muted-foreground">
                            Enable Google Cloud Armor Web Application Firewall to protect against DDoS and web attacks.
                        </p>
                    </div>
                </div>
            </CardContent>
            <CardFooter className="flex justify-end border-t pt-6">
                <Button
                    onClick={() => saveSecuritySettings(projectId)}
                    disabled={saving}
                    loading={saving}
                >
                    {saving ? 'Saving...' : 'Save'}
                </Button>
            </CardFooter>
        </Card>
    );
}
