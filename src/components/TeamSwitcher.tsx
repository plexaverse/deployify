import { useEffect, useRef, useState } from 'react';
import { useTeam } from '@/contexts/TeamContext';
import { Check, ChevronsUpDown, User, Users, Plus } from 'lucide-react';
import { useStore } from '@/store';
import { CreateTeamModal } from '@/components/CreateTeamModal';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

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
                    className="flex items-center justify-between w-full p-2.5 text-sm border border-[var(--border)] rounded-xl hover:bg-[var(--card-hover)] transition-all duration-200 hover:shadow-sm"
                >
                    <div className="flex items-center gap-3 overflow-hidden">
                        <Avatar className={cn("h-7 w-7 rounded-lg", activeTeam ? "bg-[var(--info-bg)]" : "bg-[var(--primary)]/10")}>
                            {activeTeam ? (
                                <>
                                    <AvatarImage src={activeTeam.avatarUrl || undefined} alt={activeTeam.name} />
                                    <AvatarFallback className="rounded-lg bg-[var(--info-bg)] text-[var(--info)]">
                                        <Users className="w-4 h-4" />
                                    </AvatarFallback>
                                </>
                            ) : (
                                <AvatarFallback className="rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                                    <User className="w-4 h-4" />
                                </AvatarFallback>
                            )}
                        </Avatar>
                        <div className="flex flex-col items-start min-w-0">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] leading-none mb-1">Workspace</span>
                            <span className="font-semibold truncate leading-tight">
                                {activeTeam ? activeTeam.name : 'Personal'}
                            </span>
                        </div>
                    </div>
                    <ChevronsUpDown className="w-4 h-4 text-[var(--muted-foreground)] ml-2 flex-shrink-0" />
                </button>

                {isTeamSwitcherOpen && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-1.5 space-y-1">
                        <div>
                            <button
                                onClick={() => {
                                    setActiveTeam(null);
                                    setTeamSwitcherOpen(false);
                                }}
                                className="flex items-center w-full gap-3 p-2 text-sm rounded-lg hover:bg-[var(--card-hover)] transition-colors"
                            >
                                <Avatar className="h-6 w-6 rounded-md bg-[var(--primary)]/10">
                                    <AvatarFallback className="rounded-md bg-[var(--primary)]/10 text-[var(--primary)]">
                                        <User className="w-3.5 h-3.5" />
                                    </AvatarFallback>
                                </Avatar>
                                <span className="flex-1 text-left text-[10px] font-bold uppercase tracking-wider">Personal Workspace</span>
                                {!activeTeam && <Check className="w-4 h-4 text-[var(--primary)]" />}
                            </button>
                        </div>

                        {teams.length > 0 && (
                            <div className="pt-1.5 border-t border-[var(--border)] space-y-1">
                                <div className="px-2 pb-1.5 text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">Teams</div>
                                {teams.map((team) => (
                                    <button
                                        key={team.id}
                                        onClick={() => {
                                            setActiveTeam(team);
                                            setTeamSwitcherOpen(false);
                                        }}
                                        className="flex items-center w-full gap-3 p-2 text-sm rounded-lg hover:bg-[var(--card-hover)] transition-colors"
                                    >
                                        <Avatar className="h-6 w-6 rounded-md bg-[var(--info-bg)]">
                                            <AvatarImage src={team.avatarUrl || undefined} alt={team.name} />
                                            <AvatarFallback className="rounded-md bg-[var(--info-bg)] text-[var(--info)]">
                                                <Users className="w-3.5 h-3.5" />
                                            </AvatarFallback>
                                        </Avatar>
                                        <span className="flex-1 text-left truncate font-medium">{team.name}</span>
                                        {activeTeam?.id === team.id && (
                                            <Check className="w-4 h-4 text-[var(--primary)]" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="pt-1.5 border-t border-[var(--border)]">
                            <button
                                onClick={() => {
                                    setIsCreateModalOpen(true);
                                    setTeamSwitcherOpen(false);
                                }}
                                className="flex items-center w-full gap-3 p-2 text-sm rounded-lg hover:bg-[var(--card-hover)] transition-colors text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                            >
                                <div className="flex items-center justify-center w-6 h-6 rounded-md border border-dashed border-[var(--border)]">
                                    <Plus className="w-4 h-4" />
                                </div>
                                <span className="flex-1 text-left text-[10px] font-bold uppercase tracking-wider">Create Team</span>
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
