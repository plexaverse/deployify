'use client';

import { createContext, useContext, useEffect, ReactNode } from 'react';
import type { Team, TeamWithRole } from '@/types';
import { useStore } from '@/store';

interface TeamContextType {
    activeTeam: TeamWithRole | null;
    setActiveTeam: (team: TeamWithRole | null) => void;
    teams: TeamWithRole[];
    isLoading: boolean;
    fetchTeams: () => Promise<void>;
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

export function TeamProvider({ children }: { children: ReactNode }) {
    const { activeTeam, teams, isLoadingTeams, setActiveTeam, fetchTeams } = useStore();

    useEffect(() => {
        fetchTeams();
    }, [fetchTeams]);

    return (
        <TeamContext.Provider value={{
            activeTeam,
            setActiveTeam,
            teams,
            isLoading: isLoadingTeams,
            fetchTeams
        }}>
            {children}
        </TeamContext.Provider>
    );
}

export function useTeam() {
    const context = useContext(TeamContext);
    if (context === undefined) {
        throw new Error('useTeam must be used within a TeamProvider');
    }
    return context;
}
