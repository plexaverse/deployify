'use client';

import { useState, useEffect, useRef } from 'react';
import { useTeam } from '@/contexts/TeamContext';
import { Check, ChevronsUpDown, User, Users, Plus } from 'lucide-react';
import { toast } from 'sonner';

export function TeamSwitcher() {
    const { activeTeam, setActiveTeam, teams, isLoading, refreshTeams } = useTeam();
    const [isOpen, setIsOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [newTeamName, setNewTeamName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setIsCreating(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (isCreating && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isCreating]);

    const handleCreateTeam = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTeamName.trim()) return;

        setIsSubmitting(true);
        try {
            const response = await fetch('/api/teams', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newTeamName }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to create team');
            }

            toast.success('Team created successfully');
            setNewTeamName('');
            setIsCreating(false);
            setIsOpen(false);

            // Refresh teams
            await refreshTeams();

            // Select the new team
            if (data.team) {
                 setActiveTeam({ ...data.team, role: 'owner' });
            }

        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to create team');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return <div className="h-10 animate-pulse bg-[var(--card)] rounded-md mb-4" />;
    }

    return (
        <div className="relative mb-4" ref={containerRef}>
            <button
                onClick={() => {
                    setIsOpen(!isOpen);
                    setIsCreating(false);
                }}
                className="flex items-center justify-between w-full p-2 text-sm border border-[var(--border)] rounded-lg hover:bg-[var(--background)] transition-colors"
            >
                <div className="flex items-center gap-2 overflow-hidden">
                    {activeTeam ? (
                        <div className="flex items-center justify-center w-6 h-6 min-w-[24px] rounded bg-blue-500/10 text-blue-500">
                             {activeTeam.avatarUrl ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={activeTeam.avatarUrl} alt={activeTeam.name} className="w-6 h-6 rounded" />
                             ) : (
                                <Users className="w-4 h-4" />
                             )}
                        </div>
                    ) : (
                        <div className="flex items-center justify-center w-6 h-6 min-w-[24px] rounded bg-[var(--primary)]/10 text-[var(--primary)]">
                            <User className="w-4 h-4" />
                        </div>
                    )}
                    <span className="font-medium truncate">
                        {activeTeam ? activeTeam.name : 'Personal Workspace'}
                    </span>
                </div>
                <ChevronsUpDown className="w-4 h-4 text-[var(--muted-foreground)] ml-2 flex-shrink-0" />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-lg overflow-hidden">
                    <div className="p-1">
                        <button
                            onClick={() => {
                                setActiveTeam(null);
                                setIsOpen(false);
                            }}
                            className="flex items-center w-full gap-2 p-2 text-sm rounded hover:bg-[var(--background)] transition-colors"
                        >
                            <div className="flex items-center justify-center w-6 h-6 rounded bg-[var(--primary)]/10 text-[var(--primary)]">
                                <User className="w-4 h-4" />
                            </div>
                            <span className="flex-1 text-left">Personal Workspace</span>
                            {!activeTeam && <Check className="w-4 h-4 text-[var(--primary)]" />}
                        </button>
                    </div>

                    {teams.length > 0 && (
                        <div className="p-1 border-t border-[var(--border)]">
                            <div className="px-2 py-1 text-xs text-[var(--muted-foreground)]">Teams</div>
                            {teams.map((team) => (
                                <button
                                    key={team.id}
                                    onClick={() => {
                                        setActiveTeam(team);
                                        setIsOpen(false);
                                    }}
                                    className="flex items-center w-full gap-2 p-2 text-sm rounded hover:bg-[var(--background)] transition-colors"
                                >
                                    <div className="flex items-center justify-center w-6 h-6 rounded bg-blue-500/10 text-blue-500">
                                         {team.avatarUrl ? (
                                            /* eslint-disable-next-line @next/next/no-img-element */
                                            <img src={team.avatarUrl} alt={team.name} className="w-6 h-6 rounded" />
                                         ) : (
                                            <Users className="w-4 h-4" />
                                         )}
                                    </div>
                                    <span className="flex-1 text-left truncate">{team.name}</span>
                                    {activeTeam?.id === team.id && (
                                        <Check className="w-4 h-4 text-[var(--primary)]" />
                                    )}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="p-1 border-t border-[var(--border)]">
                        {isCreating ? (
                            <form onSubmit={handleCreateTeam} className="p-2">
                                <div className="flex items-center gap-2 mb-2">
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        placeholder="Team Name"
                                        value={newTeamName}
                                        onChange={(e) => setNewTeamName(e.target.value)}
                                        className="w-full text-sm bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                                        disabled={isSubmitting}
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="submit"
                                        disabled={isSubmitting || !newTeamName.trim()}
                                        className="flex-1 btn btn-primary text-xs py-1 h-7"
                                    >
                                        {isSubmitting ? 'Creating...' : 'Create'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsCreating(false)}
                                        className="btn btn-ghost text-xs py-1 h-7 px-2"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsCreating(true);
                                }}
                                className="flex items-center w-full gap-2 p-2 text-sm rounded hover:bg-[var(--background)] transition-colors text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                            >
                                <div className="flex items-center justify-center w-6 h-6 rounded border border-dashed border-[var(--muted-foreground)]">
                                    <Plus className="w-3 h-3" />
                                </div>
                                <span className="flex-1 text-left">Create Team</span>
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
