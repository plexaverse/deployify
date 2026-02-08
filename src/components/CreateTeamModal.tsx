'use client';

import { useState } from 'react';
import { X, Users, Loader2 } from 'lucide-react';
import { useStore } from '@/store';
import { useTeam } from '@/contexts/TeamContext';
import { toast } from 'sonner';

interface CreateTeamModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function CreateTeamModal({ isOpen, onClose }: CreateTeamModalProps) {
    const [name, setName] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { fetchTeams } = useStore();
    const { setActiveTeam } = useTeam();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name.trim()) return;

        setIsLoading(true);
        try {
            const response = await fetch('/api/teams', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim() }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to create team');
            }

            toast.success('Team created successfully');

            // Refresh teams and switch to the new team
            await fetchTeams();
            setActiveTeam(data.team);

            onClose();
            setName('');
        } catch (error: any) {
            console.error('Error creating team:', error);
            toast.error(error.message || 'Failed to create team');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-[var(--card)] border border-[var(--border)] w-full max-w-md rounded-xl shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-[var(--background)] shrink-0">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                        <Users className="w-5 h-5 text-[var(--primary)]" />
                        Create New Team
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-[var(--border)] rounded-md transition-colors"
                        disabled={isLoading}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit} className="p-6">
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="team-name" className="text-sm font-medium text-[var(--muted-foreground)] block mb-1">
                                Team Name
                            </label>
                            <input
                                id="team-name"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Acme Corp"
                                className="input w-full"
                                autoFocus
                                disabled={isLoading}
                            />
                            <p className="text-xs text-[var(--muted-foreground)] mt-1">
                                This will be the name of your new team workspace.
                            </p>
                        </div>
                    </div>

                    <div className="mt-6 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-md hover:bg-[var(--border)] transition-colors text-sm"
                            disabled={isLoading}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!name.trim() || isLoading}
                            className="px-4 py-2 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity font-medium text-sm flex items-center gap-2"
                        >
                            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                            Create Team
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
