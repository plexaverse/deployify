import { useEffect, useRef, useState } from 'react';
import { useTeam } from '@/contexts/TeamContext';
import { Check, ChevronsUpDown, User, Users, Plus } from 'lucide-react';
import { useStore } from '@/store';
import { CreateTeamModal } from '@/components/CreateTeamModal';
import { Button } from '@/components/ui/button';
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
        return <Skeleton className="h-10 w-full rounded-md mb-4" />;
    }

    return (
        <>
            <div className="relative mb-4" ref={containerRef}>
                <Button
                    variant="outline"
                    onClick={toggleTeamSwitcher}
                    className="w-full justify-between p-2 h-auto font-normal hover:bg-[var(--background)]"
                >
                    <div className="flex items-center gap-2 overflow-hidden text-left">
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
                        <span className="truncate">
                            {activeTeam ? activeTeam.name : 'Personal Workspace'}
                        </span>
                    </div>
                    <ChevronsUpDown className="w-4 h-4 text-[var(--muted-foreground)] ml-2 flex-shrink-0" />
                </Button>

                {isTeamSwitcherOpen && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-1">
                            <Button
                                variant="ghost"
                                onClick={() => {
                                    setActiveTeam(null);
                                    setTeamSwitcherOpen(false);
                                }}
                                className="w-full justify-start p-2 h-auto font-normal"
                            >
                                <div className="flex items-center justify-center w-6 h-6 min-w-[24px] rounded bg-[var(--primary)]/10 text-[var(--primary)] mr-2">
                                    <User className="w-4 h-4" />
                                </div>
                                <span className="flex-1 text-left">Personal Workspace</span>
                                {!activeTeam && <Check className="w-4 h-4 text-[var(--primary)]" />}
                            </Button>
                        </div>

                        {teams.length > 0 && (
                            <div className="p-1 border-t border-[var(--border)]">
                                <div className="px-2 py-1 text-xs text-[var(--muted-foreground)]">Teams</div>
                                {teams.map((team) => (
                                    <Button
                                        key={team.id}
                                        variant="ghost"
                                        onClick={() => {
                                            setActiveTeam(team);
                                            setTeamSwitcherOpen(false);
                                        }}
                                        className="w-full justify-start p-2 h-auto font-normal"
                                    >
                                        <div className="flex items-center justify-center w-6 h-6 min-w-[24px] rounded bg-blue-500/10 text-blue-500 mr-2">
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
                                    </Button>
                                ))}
                            </div>
                        )}

                        <div className="p-1 border-t border-[var(--border)]">
                            <Button
                                variant="ghost"
                                onClick={() => {
                                    setIsCreateModalOpen(true);
                                    setTeamSwitcherOpen(false);
                                }}
                                className="w-full justify-start p-2 h-auto font-normal text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                            >
                                <div className="flex items-center justify-center w-6 h-6 min-w-[24px] rounded border border-dashed border-[var(--border)] mr-2">
                                    <Plus className="w-4 h-4" />
                                </div>
                                <span className="flex-1 text-left">Create Team</span>
                            </Button>
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
