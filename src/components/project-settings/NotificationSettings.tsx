'use client';

import { useStore } from '@/store';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

interface NotificationSettingsProps {
    projectId: string;
}

export function NotificationSettings({ projectId }: NotificationSettingsProps) {
    const {
        emailNotifications,
        webhookUrl,
        isSavingWebhook: saving,
        setProjectSettingsField,
        saveNotificationSettings
    } = useStore();

    return (
        <Card className="mt-8">
            <CardHeader>
                <CardTitle>Notifications</CardTitle>
                <CardDescription>Manage how you receive updates about your project.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center gap-4 p-4 border rounded-md bg-secondary/20">
                    <Switch
                        id="email-notifications"
                        checked={emailNotifications}
                        onCheckedChange={(checked) => setProjectSettingsField('emailNotifications', checked)}
                    />
                    <div className="space-y-0.5">
                        <Label htmlFor="email-notifications">Email Notifications</Label>
                        <p className="text-xs text-muted-foreground">
                            Receive email notifications when a deployment succeeds or fails.
                        </p>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="webhook-url">Webhook URL</Label>
                    <Input
                        id="webhook-url"
                        type="text"
                        value={webhookUrl}
                        onChange={(e) => setProjectSettingsField('webhookUrl', e.target.value)}
                        placeholder="https://discord.com/api/webhooks/..."
                    />
                    <p className="text-xs text-muted-foreground">
                        Receive notifications when a build fails. Supports Discord, Slack, etc.
                    </p>
                </div>
            </CardContent>
            <CardFooter className="flex justify-end border-t pt-6">
                <Button
                    onClick={() => saveNotificationSettings(projectId)}
                    disabled={saving}
                    loading={saving}
                >
                    {saving ? 'Saving...' : 'Save'}
                </Button>
            </CardFooter>
        </Card>
    );
}
