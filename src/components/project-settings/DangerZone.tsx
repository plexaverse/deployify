'use client';

import { useRouter } from 'next/navigation';
import { useStore } from '@/store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface DangerZoneProps {
    projectId: string;
}

export function DangerZone({ projectId }: DangerZoneProps) {
    const router = useRouter();
    const { deleteProject, currentProject } = useStore();

    const handleDeleteProject = async () => {
        if (!currentProject) return;
        const success = await deleteProject(currentProject.id);
        if (success) {
            router.push('/dashboard');
        }
    };

    return (
        <Card className="mt-8 border-destructive/50">
            <CardHeader>
                <CardTitle className="text-destructive">Danger Zone</CardTitle>
                <CardDescription>Irreversible and destructive actions.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-between py-3">
                    <div>
                        <p className="font-medium">Delete Project</p>
                        <p className="text-sm text-muted-foreground">
                            Permanently delete this project and all its deployments
                        </p>
                    </div>
                    <Button
                        variant="ghost"
                        onClick={handleDeleteProject}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 border border-destructive/20"
                    >
                        Delete Project
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
