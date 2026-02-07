'use client';

import { createContext, useContext, useEffect, ReactNode } from 'react';
import type { Team } from '@/types';
import { useStore } from '@/store';

interface TeamContextType {
    activeTeam: Team | null;
    setActiveTeam: (team: Team | null) => void;
    teams: Team[];
    isLoading: boolean;
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
            isLoading: isLoadingTeams
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
