'use client';

import { Loader2 } from 'lucide-react';
import { useStore } from '@/store';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface BuildSettingsProps {
    projectId: string;
}

export function BuildSettings({ projectId }: BuildSettingsProps) {
    const {
        buildCommand,
        installCommand,
        rootDirectory,
        outputDirectory,
        isSavingProjectSettings: saving,
        setProjectSettingsField,
        saveProjectSettings
    } = useStore();

    return (
        <Card>
            <CardHeader>
                <CardTitle>Build Settings</CardTitle>
                <CardDescription>Configure how your project is built.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="build-command">Build Command</Label>
                        <Input
                            id="build-command"
                            type="text"
                            value={buildCommand}
                            onChange={(e) => setProjectSettingsField('buildCommand', e.target.value)}
                            placeholder="npm run build"
                        />
                        <p className="text-xs text-muted-foreground">
                            Command to build your project
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="output-directory">Output Directory</Label>
                        <Input
                            id="output-directory"
                            type="text"
                            value={outputDirectory}
                            onChange={(e) => setProjectSettingsField('outputDirectory', e.target.value)}
                            placeholder=".next"
                        />
                        <p className="text-xs text-muted-foreground">
                            Directory where build artifacts are located
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="install-command">Install Command</Label>
                        <Input
                            id="install-command"
                            type="text"
                            value={installCommand}
                            onChange={(e) => setProjectSettingsField('installCommand', e.target.value)}
                            placeholder="npm install"
                        />
                        <p className="text-xs text-muted-foreground">
                            Command to install dependencies
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="root-directory">Root Directory</Label>
                        <Input
                            id="root-directory"
                            type="text"
                            value={rootDirectory}
                            onChange={(e) => setProjectSettingsField('rootDirectory', e.target.value)}
                            placeholder="./"
                        />
                        <p className="text-xs text-muted-foreground">
                            Directory where your code lives
                        </p>
                    </div>
                </div>
            </CardContent>
            <CardFooter className="flex justify-end border-t pt-6">
                <Button
                    onClick={() => saveProjectSettings(projectId)}
                    disabled={saving}
                    loading={saving}
                >
                    {saving ? 'Saving...' : 'Save Changes'}
                </Button>
            </CardFooter>
        </Card>
    );
}
