'use client';

import { useState } from 'react';
import { Users, X, Loader2 } from 'lucide-react';
import { useStore } from '@/store';
import { toast } from 'sonner';
import { Portal } from '@/components/ui/portal';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Button as MovingBorderButton } from '@/components/ui/moving-border';
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
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                <Card className="w-full max-w-md p-0 overflow-hidden animate-fade-in shadow-2xl">
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-[var(--border)] bg-[var(--background)] shrink-0">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                                <Users className="w-5 h-5 text-[var(--primary)]" />
                            </div>
                            <div className="space-y-0.5">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Workspace Management</span>
                                <h3 className="text-[11px] font-bold tracking-tight text-[var(--foreground)]">Create New Team</h3>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onClose}
                            className="h-8 w-8 rounded-full"
                        >
                            <X className="w-5 h-5" />
                        </Button>
                    </div>

                    {/* Content */}
                    <form onSubmit={handleSubmit} className="p-6 space-y-4">
                        <div className="space-y-2">
                            <Label className="text-[11px] font-bold">Team Name</Label>
                            <Input
                                type="text"
                                value={name}
                                onChange={handleNameChange}
                                placeholder="ACME CORP"
                                className="placeholder:text-[9px] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[11px] font-bold">Team Slug</Label>
                            <Input
                                type="text"
                                value={slug}
                                onChange={(e) => setSlug(e.target.value)}
                                placeholder="ACME-CORP"
                                className="font-mono text-[11px] placeholder:text-[9px] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider"
                                required
                                pattern="^[a-z0-9-]+$"
                                title="Only lowercase letters, numbers, and hyphens allowed"
                            />
                            <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
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
                            <MovingBorderButton
                                type="submit"
                                disabled={isSubmitting || !name || !slug}
                                containerClassName="h-10 w-32"
                                className="text-[9px] font-bold uppercase tracking-wider"
                            >
                                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                {isSubmitting ? 'Creating...' : 'Create Team'}
                            </MovingBorderButton>
                        </div>
                    </form>
                </Card>
            </div>
        </Portal>
    );
}
