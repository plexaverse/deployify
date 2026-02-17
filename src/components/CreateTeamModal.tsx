'use client';

import { useState } from 'react';
import { Users, X, Loader2 } from 'lucide-react';
import { useStore } from '@/store';
import { toast } from 'sonner';
import { Portal } from '@/components/ui/portal';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CreateTeamModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function CreateTeamModal({ isOpen, onClose }: CreateTeamModalProps) {
    const { createTeam, setActiveTeam } = useStore();
    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !slug) return;

        setIsSubmitting(true);
        try {
            const team = await createTeam(name, slug);
            if (team) {
                toast.success('Team created successfully');
                setActiveTeam(team);
                onClose();
            } else {
                toast.error('Failed to create team');
            }
        } catch (error) {
            console.error(error);
            toast.error('An error occurred');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newName = e.target.value;
        setName(newName);
        // Auto-generate slug from name if slug is empty or matches previous auto-generated slug
        if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9-]/g, '-')) {
            setSlug(newName.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
        }
    };

    return (
        <Portal>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <Card className="w-full max-w-md p-0 overflow-hidden animate-fade-in shadow-2xl">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-[var(--background)] shrink-0">
                        <h3 className="font-semibold text-lg flex items-center gap-2 text-[var(--foreground)]">
                            <Users className="w-5 h-5 text-[var(--primary)]" />
                            Create New Team
                        </h3>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onClose}
                            className="h-8 w-8"
                        >
                            <X className="w-5 h-5" />
                        </Button>
                    </div>

                    {/* Content */}
                    <form onSubmit={handleSubmit} className="p-6 space-y-4">
                        <div className="space-y-2">
                            <Label>Team Name</Label>
                            <Input
                                type="text"
                                value={name}
                                onChange={handleNameChange}
                                placeholder="Acme Corp"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Team Slug</Label>
                            <Input
                                type="text"
                                value={slug}
                                onChange={(e) => setSlug(e.target.value)}
                                placeholder="acme-corp"
                                className="font-mono text-sm"
                                required
                                pattern="^[a-z0-9-]+$"
                                title="Only lowercase letters, numbers, and hyphens allowed"
                            />
                            <p className="text-xs text-[var(--muted-foreground)]">
                                Used in URLs. Only lowercase letters, numbers, and hyphens.
                            </p>
                        </div>

                        <div className="flex justify-end gap-3 pt-4">
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={onClose}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                variant="primary"
                                disabled={isSubmitting || !name || !slug}
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                        Creating...
                                    </>
                                ) : (
                                    'Create Team'
                                )}
                            </Button>
                        </div>
                    </form>
                </Card>
            </div>
        </Portal>
    );
}
