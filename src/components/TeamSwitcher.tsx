import { useEffect, useRef, useState } from 'react';
import { useTeam } from '@/contexts/TeamContext';
import { Check, ChevronsUpDown, User, Users, Plus } from 'lucide-react';
import { useStore } from '@/store';
import { CreateTeamModal } from '@/components/CreateTeamModal';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';

export function TeamSwitcher() {
    const { activeTeam, setActiveTeam, teams, isLoading } = useTeam();
    const { isTeamSwitcherOpen, setTeamSwitcherOpen, toggleTeamSwitcher } = useStore();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setTeamSwitcherOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [setTeamSwitcherOpen]);

    if (isLoading) {
        return <Skeleton className="h-10 w-full mb-4" />;
    }

    return (
        <>
            <div className="relative mb-4" ref={containerRef}>
                <button
                    onClick={toggleTeamSwitcher}
                    className="flex items-center justify-between w-full p-2 text-sm border border-[var(--border)] rounded-lg hover:bg-[var(--background)] transition-colors"
                >
                    <div className="flex items-center gap-2 overflow-hidden">
                        {activeTeam ? (
                            <Avatar className="h-6 w-6 rounded bg-[var(--info-bg)]">
                                <AvatarImage src={activeTeam.avatarUrl || undefined} alt={activeTeam.name} />
                                <AvatarFallback className="rounded bg-[var(--info-bg)] text-[var(--info)]">
                                    <Users className="w-4 h-4" />
                                </AvatarFallback>
                            </Avatar>
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

                {isTeamSwitcherOpen && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-1">
                            <button
                                onClick={() => {
                                    setActiveTeam(null);
                                    setTeamSwitcherOpen(false);
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
                                            setTeamSwitcherOpen(false);
                                        }}
                                        className="flex items-center w-full gap-2 p-2 text-sm rounded hover:bg-[var(--background)] transition-colors"
                                    >
                                        <Avatar className="h-6 w-6 rounded bg-[var(--info-bg)]">
                                            <AvatarImage src={team.avatarUrl || undefined} alt={team.name} />
                                            <AvatarFallback className="rounded bg-[var(--info-bg)] text-[var(--info)]">
                                                <Users className="w-4 h-4" />
                                            </AvatarFallback>
                                        </Avatar>
                                        <span className="flex-1 text-left truncate">{team.name}</span>
                                        {activeTeam?.id === team.id && (
                                            <Check className="w-4 h-4 text-[var(--primary)]" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="p-1 border-t border-[var(--border)]">
                            <button
                                onClick={() => {
                                    setIsCreateModalOpen(true);
                                    setTeamSwitcherOpen(false);
                                }}
                                className="flex items-center w-full gap-2 p-2 text-sm rounded hover:bg-[var(--background)] transition-colors text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                            >
                                <div className="flex items-center justify-center w-6 h-6 rounded border border-dashed border-[var(--border)]">
                                    <Plus className="w-4 h-4" />
                                </div>
                                <span className="flex-1 text-left">Create Team</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <CreateTeamModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
            />
        </>
    );
}
